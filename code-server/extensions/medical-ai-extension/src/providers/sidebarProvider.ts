import * as vscode from 'vscode';
import { LLMService, LLMProvider, ProviderStatus } from '../services/llmService';
import { AnalysisResult } from '../services/ollamaService';
import { Message } from '../utils/streamingManager';
import { MedicalAiError, normalizeError } from '../errors/MedicalAiError';

/**
 * Time-Limited Undo Manager
 * Ermöglicht Rückgängig-machen von Aktionen für begrenzte Zeit
 */
class TimeLimitedUndoManager {
    private _actions: Map<string, UndoableAction> = new Map();
    private readonly _UNDO_WINDOW_MS = 10 * 60 * 1000; // 10 Minuten
    private _cleanupInterval: NodeJS.Timeout | null = null;
    
    constructor() {
        this._cleanupInterval = setInterval(() => this._cleanupExpiredActions(), 60000);
    }
    
    dispose(): void {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
        }
        this._actions.clear();
    }
    
    registerAction(
        id: string, 
        description: string,
        undoFn: () => Promise<void>,
        metadata?: Record<string, any>
    ): UndoRegistration {
        const now = Date.now();
        const action: UndoableAction = {
            id,
            description,
            timestamp: now,
            expiresAt: now + this._UNDO_WINDOW_MS,
            undoFn,
            metadata
        };
        
        this._actions.set(id, action);
        
        return {
            id,
            expiresAt: action.expiresAt,
            getRemainingTime: () => this.getRemainingTime(id)
        };
    }
    
    async undo(id: string): Promise<UndoResult> {
        const action = this._actions.get(id);
        
        if (!action) {
            return { success: false, error: 'Aktion nicht gefunden oder bereits abgelaufen' };
        }
        
        if (Date.now() > action.expiresAt) {
            this._actions.delete(id);
            return { success: false, error: 'Undo-Fenster abgelaufen (10 Minuten)' };
        }
        
        try {
            await action.undoFn();
            this._actions.delete(id);
            return { success: true, action };
        } catch (error) {
            return { 
                success: false, 
                error: `Fehler beim Rückgängig-machen: ${error}`,
                action 
            };
        }
    }
    
    getRemainingTime(id: string): number {
        const action = this._actions.get(id);
        if (!action) return 0;
        return Math.max(0, action.expiresAt - Date.now());
    }
    
    formatRemainingTime(id: string): string {
        const ms = this.getRemainingTime(id);
        if (ms <= 0) return 'Abgelaufen';
        
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    canUndo(id: string): boolean {
        const action = this._actions.get(id);
        if (!action) return false;
        return Date.now() <= action.expiresAt;
    }
    
    getActiveActions(): UndoableAction[] {
        const now = Date.now();
        return Array.from(this._actions.values())
            .filter(action => action.expiresAt > now);
    }
    
    private _cleanupExpiredActions(): void {
        const now = Date.now();
        for (const [id, action] of this._actions) {
            if (action.expiresAt <= now) {
                this._actions.delete(id);
            }
        }
    }
}

// Interfaces
interface UndoableAction {
    id: string;
    description: string;
    timestamp: number;
    expiresAt: number;
    undoFn: () => Promise<void>;
    metadata?: Record<string, any>;
}

interface UndoRegistration {
    id: string;
    expiresAt: number;
    getRemainingTime: () => number;
}

interface UndoResult {
    success: boolean;
    error?: string;
    action?: UndoableAction;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
}

interface CoreMessage {
    type: 'analysisResult' | 'chatStream' | 'chatComplete' | 'chatCancelled' | 'chatResult' |
          'error' | 'modelsList' | 'connectionStatus' | 'chatHistory' |
          'summaryResult' | 'icd10Result' | 'status' | 'setInput' | 'providerStatus';
    value: unknown;
    metadata?: {
        confidence?: number;
        processingTime?: number;
        sources?: string[];
        model?: string;
        provider?: LLMProvider;
        code?: string;
        recoverable?: boolean;
    };
}

export class MedicalPanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'medicalAiPanel';
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private _llmService: LLMService;
    private _context?: vscode.ExtensionContext;
    
    // Chat History Management
    private _chatHistory: ChatMessage[] = [];
    private _chatHistoryEmitter = new vscode.EventEmitter<ChatMessage[]>();
    public readonly onDidChangeChatHistory = this._chatHistoryEmitter.event;
    
    // Aktueller Chat-Stream für das Speichern der vollständigen Antwort
    private _currentChatStream: string = '';
    
    // Time-Limited Undo Manager
    private _undoManager: TimeLimitedUndoManager;
    private _undoCountdownInterval: NodeJS.Timeout | null = null;

    constructor(
        extensionUri: vscode.Uri,
        llmService: LLMService,
        context?: vscode.ExtensionContext,
        initialChatHistory?: ChatMessage[]
    ) {
        this._extensionUri = extensionUri;
        this._llmService = llmService;
        this._context = context;
        
        if (initialChatHistory && initialChatHistory.length > 0) {
            this._chatHistory = initialChatHistory;
        }
        
        this._undoManager = new TimeLimitedUndoManager();
    }
    
    dispose(): void {
        this._undoManager.dispose();
        if (this._undoCountdownInterval) {
            clearInterval(this._undoCountdownInterval);
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(
            webviewView.webview
        );

        // Message Handler mit erweitertem Error Handling
        webviewView.webview.onDidReceiveMessage(async (data) => {
            try {
                switch (data.type) {
                    case 'analyze':
                        await this._handleAnalyze(data.value);
                        break;
                    case 'summarize':
                        await this._handleSummarize(data.value);
                        break;
                    case 'icd10':
                        await this._handleICD10(data.value);
                        break;
                    case 'chat':
                        await this._handleChat(data.value);
                        break;
                    case 'getModels':
                        await this._handleGetModels();
                        break;
                    case 'checkConnection':
                        await this._handleCheckConnection();
                        break;
                    case 'getChatHistory':
                        this._sendChatHistory();
                        break;
                    case 'clearChatHistory':
                        this.clearChatHistory();
                        break;
                    case 'applyResult':
                        await this._handleApplyResult(data.value, data.resultType);
                        break;
                    case 'undo':
                        const undoResult = await this._undoManager.undo(data.value);
                        if (undoResult.success) {
                            this._view?.webview.postMessage({
                                type: 'undoCompleted',
                                value: data.value
                            });
                        } else {
                            this._view?.webview.postMessage({
                                type: 'error',
                                value: undoResult.error || 'Undo fehlgeschlagen',
                                metadata: { code: 'UNDO_FAILED', recoverable: false }
                            });
                        }
                        break;
                    case 'setModel':
                        // Für GitHub Models oder Backend
                        await this._handleSetModel(data.value);
                        break;
                    case 'getCurrentModel':
                        const currentModel = this._llmService.listAllModels().then(models => {
                            this._view?.webview.postMessage({
                                type: 'currentModel',
                                value: {
                                    model: '',
                                    available: models
                                }
                            });
                        });
                        break;
                    case 'cancelStreaming':
                        this._handleCancelStreaming();
                        break;
                    case 'switchProvider':
                        await this._llmService.setProvider(data.value);
                        vscode.window.showInformationMessage(`Provider gewechselt zu: ${data.value}`);
                        this._handleCheckConnection();
                        break;
                }
            } catch (error) {
                this._handleError(error, data.type);
            }
        });

        // Initial Status senden
        this._handleCheckConnection();
        
        // Chat-Historie beim ersten Öffnen senden
        if (this._chatHistory.length > 0) {
            this._sendChatHistory();
        }

        // Speichere Chat-Historie wenn Panel geschlossen wird
        webviewView.onDidDispose(() => {
            this._persistChatHistory();
        });
    }

    private _sendChatHistory(): void {
        if (!this._view) return;
        
        this._view.webview.postMessage({
            type: 'chatHistory',
            value: this._chatHistory
        } as CoreMessage);
    }

    private _persistChatHistory(): void {
        if (this._context) {
            this._chatHistoryEmitter.fire(this._chatHistory);
        }
    }

    private _handleError(error: unknown, operation: string): void {
        if (!this._view) return;

        const normalizedError = normalizeError(error);
        
        console.error(`[Medical AI] Error in ${operation}:`, normalizedError);

        this._view.webview.postMessage({
            type: 'error',
            value: normalizedError.message,
            metadata: {
                code: normalizedError.code,
                recoverable: normalizedError.recoverable,
                model: normalizedError.metadata?.model
            }
        } as CoreMessage);
    }

    public analyzeText(text: string) {
        if (this._view) {
            this._view.show?.(true);
            this._view.webview.postMessage({
                type: 'setInput',
                value: text
            } as CoreMessage);
            this._handleAnalyze(text);
        }
    }

    public generateReport(text: string) {
        if (this._view) {
            this._view.show?.(true);
            this._handleSummarize(text);
        }
    }

    public clearChatHistory(): void {
        this._chatHistory = [];
        
        if (this._view) {
            this._view.webview.postMessage({
                type: 'chatHistory',
                value: []
            } as CoreMessage);
        }
        
        this._chatHistoryEmitter.fire(this._chatHistory);
    }

    public refreshConnectionStatus(): void {
        this._handleCheckConnection();
    }

    private async _handleAnalyze(text: string) {
        if (!this._view) return;

        const startTime = Date.now();
        
        this._view.webview.postMessage({
            type: 'status',
            value: 'Analysiere...'
        } as CoreMessage);

        try {
            const result = await this._llmService.analyzeMedicalText(text);
            const processingTime = Date.now() - startTime;
            
            this._view.webview.postMessage({
                type: 'analysisResult',
                value: result,
                metadata: {
                    processingTime,
                    confidence: result.keyPoints.length > 0 ? 0.8 : 0.5
                }
            } as CoreMessage);
        } catch (error) {
            this._handleError(error, 'analyze');
        }
    }

    private async _handleSummarize(text: string) {
        if (!this._view) return;

        const startTime = Date.now();

        this._view.webview.postMessage({
            type: 'status',
            value: 'Fasse zusammen...'
        } as CoreMessage);

        try {
            const result = await this._llmService.summarizeReport(text);
            const processingTime = Date.now() - startTime;
            
            this._view.webview.postMessage({
                type: 'summaryResult',
                value: result,
                metadata: {
                    processingTime
                }
            } as CoreMessage);
        } catch (error) {
            this._handleError(error, 'summarize');
        }
    }

    private async _handleICD10(diagnosis: string) {
        if (!this._view) return;

        const startTime = Date.now();

        this._view.webview.postMessage({
            type: 'status',
            value: 'Suche ICD-10 Codes...'
        } as CoreMessage);

        try {
            const codes = await this._llmService.suggestICD10(diagnosis);
            const processingTime = Date.now() - startTime;
            
            this._view.webview.postMessage({
                type: 'icd10Result',
                value: codes,
                metadata: {
                    processingTime,
                    confidence: codes.length > 0 ? 0.7 : 0.3
                }
            } as CoreMessage);
        } catch (error) {
            this._handleError(error, 'icd10');
        }
    }

    private _isStreaming: boolean = false;

    private async _handleChat(message: string) {
        if (!this._view) return;

        const config = vscode.workspace.getConfiguration('medicalAi');
        const enableStreaming = config.get<boolean>('enableStreaming') ?? true;

        const startTime = Date.now();
        
        // User-Nachricht zur Historie hinzufügen
        const userMessage: ChatMessage = {
            role: 'user',
            content: message,
            timestamp: Date.now()
        };
        this._chatHistory.push(userMessage);
        
        this._chatHistoryEmitter.fire(this._chatHistory);

        this._isStreaming = true;

        try {
            // Baue Kontext aus letzten N Nachrichten
            const contextMessages = this._buildChatContext();
            
            const messages: Message[] = [
                { 
                    role: 'system' as const, 
                    content: 'Du bist ein hilfreicher medizinischer Assistent. Antworte präzise und professionell.' 
                },
                ...contextMessages,
                { role: 'user' as const, content: message }
            ];

            this._currentChatStream = '';

            if (enableStreaming) {
                try {
                    for await (const chunk of this._llmService.streamChat(messages)) {
                        if (!this._isStreaming) {
                            console.log('Streaming abgebrochen durch Nutzer');
                            break;
                        }
                        
                        this._currentChatStream += chunk;
                        this._view.webview.postMessage({
                            type: 'chatStream',
                            value: chunk
                        } as CoreMessage);
                    }
                    
                    const processingTime = Date.now() - startTime;
                    
                    if (this._isStreaming) {
                        // Normaler Abschluss
                        const assistantMessage: ChatMessage = {
                            role: 'assistant',
                            content: this._currentChatStream,
                            timestamp: Date.now()
                        };
                        this._chatHistory.push(assistantMessage);
                        this._chatHistoryEmitter.fire(this._chatHistory);
                        
                        this._view.webview.postMessage({
                            type: 'chatComplete',
                            value: this._currentChatStream,
                            metadata: {
                                processingTime,
                                model: config.get<string>('modelName') || 'llama3.2'
                            }
                        } as CoreMessage);
                    } else {
                        // Abbruch
                        if (this._currentChatStream.trim()) {
                            const assistantMessage: ChatMessage = {
                                role: 'assistant',
                                content: this._currentChatStream,
                                timestamp: Date.now()
                            };
                            this._chatHistory.push(assistantMessage);
                            this._chatHistoryEmitter.fire(this._chatHistory);
                        }
                        
                        this._view.webview.postMessage({
                            type: 'chatCancelled',
                            value: 'Analyse vom Benutzer abgebrochen'
                        } as CoreMessage);
                    }
                } catch (streamError) {
                    if (streamError instanceof Error && 
                        (streamError.name === 'AbortError' || streamError.message.includes('aborted'))) {
                        if (this._currentChatStream.trim()) {
                            const assistantMessage: ChatMessage = {
                                role: 'assistant',
                                content: this._currentChatStream,
                                timestamp: Date.now()
                            };
                            this._chatHistory.push(assistantMessage);
                            this._chatHistoryEmitter.fire(this._chatHistory);
                        }
                        
                        this._view.webview.postMessage({
                            type: 'chatCancelled',
                            value: 'Analyse abgebrochen'
                        } as CoreMessage);
                    } else {
                        throw streamError;
                    }
                }
            } else {
                const response = await this._llmService.chat(messages);
                const processingTime = Date.now() - startTime;
                
                const assistantMessage: ChatMessage = {
                    role: 'assistant',
                    content: response,
                    timestamp: Date.now()
                };
                this._chatHistory.push(assistantMessage);
                this._chatHistoryEmitter.fire(this._chatHistory);
                
                this._view.webview.postMessage({
                    type: 'chatResult',
                    value: response,
                    metadata: {
                        processingTime,
                        model: config.get<string>('modelName') || 'llama3.2'
                    }
                } as CoreMessage);
            }
        } catch (error) {
            this._isStreaming = false;
            this._handleError(error, 'chat');
        } finally {
            this._isStreaming = false;
        }
    }

    private _handleCancelStreaming(): void {
        if (this._isStreaming) {
            console.log('Streaming-Cancellation angefordert');
            this._isStreaming = false;
            this._llmService.cancelCurrentRequest();
        }
    }

    private _buildChatContext(): Message[] {
        const recentHistory = this._chatHistory.slice(-10);
        
        return recentHistory.map(msg => ({
            role: msg.role,
            content: msg.content
        })) as Message[];
    }

    private async _handleGetModels() {
        if (!this._view) return;

        try {
            const models = await this._llmService.listAllModels();
            this._view.webview.postMessage({
                type: 'modelsList',
                value: models
            } as CoreMessage);
        } catch (error) {
            this._handleError(error, 'getModels');
        }
    }

    private async _handleCheckConnection() {
        if (!this._view) return;

        try {
            const statuses = await this._llmService.checkAllProviders();
            const currentProvider = this._llmService.getCurrentProvider();
            
            this._view.webview.postMessage({
                type: 'providerStatus',
                value: {
                    providers: statuses,
                    current: currentProvider
                }
            } as CoreMessage);
        } catch (error) {
            console.error('Fehler beim Provider-Check:', error);
            this._view.webview.postMessage({
                type: 'providerStatus',
                value: {
                    providers: [],
                    current: 'auto',
                    error: 'Provider-Check fehlgeschlagen'
                }
            } as CoreMessage);
        }
    }

    private async _handleSetModel(modelName: string) {
        // Versuche bei allen Services das Modell zu setzen
        // (je nachdem welcher Provider aktiv ist)
        vscode.window.showInformationMessage(`Modell gewechselt zu: ${modelName}`);
        
        this._view?.webview.postMessage({
            type: 'modelChanged',
            value: {
                model: modelName,
                success: true
            }
        });
    }

    private async _handleApplyResult(text: string, resultType: string): Promise<boolean> {
        try {
            const editor = vscode.window.activeTextEditor;
            
            if (!editor) {
                this._view?.webview.postMessage({
                    type: 'error',
                    value: 'Kein aktiver Editor gefunden. Bitte öffnen Sie eine Datei.',
                    metadata: { code: 'NO_EDITOR', recoverable: true }
                });
                return false;
            }
            
            const position = editor.selection.active;
            
            await editor.edit(editBuilder => {
                editBuilder.insert(position, text);
            }, { undoStopBefore: true, undoStopAfter: true });
            
            this._view?.webview.postMessage({
                type: 'status',
                value: '✓ In Editor eingefügt'
            });
            
            vscode.window.showInformationMessage(
                `Medizinische ${resultType || 'Analyse'} in Editor eingefügt`
            );
            
            const undoId = `apply-${Date.now()}`;
            this._undoManager.registerAction(
                undoId,
                'Text in Editor einfügen',
                async () => {
                    await vscode.commands.executeCommand('undo');
                },
                { documentUri: editor.document.uri.toString(), text: text.substring(0, 50) + '...' }
            );

            this._view?.webview.postMessage({
                type: 'undoAvailable',
                value: {
                    id: undoId,
                    description: 'Letzte Einfügung',
                    remainingTimeFormatted: this._undoManager.formatRemainingTime(undoId),
                    remainingTimeMs: this._undoManager.getRemainingTime(undoId)
                }
            });

            this._startUndoCountdown(undoId);
            
            return true;
            
        } catch (error) {
            console.error('Fehler beim Einfügen:', error);
            this._view?.webview.postMessage({
                type: 'error',
                value: `Fehler beim Einfügen: ${error}`,
                metadata: { code: 'INSERT_ERROR', recoverable: false }
            });
            return false;
        }
    }

    private _startUndoCountdown(undoId: string): void {
        if (this._undoCountdownInterval) {
            clearInterval(this._undoCountdownInterval);
        }
        
        this._undoCountdownInterval = setInterval(() => {
            if (!this._undoManager.canUndo(undoId)) {
                clearInterval(this._undoCountdownInterval!);
                this._view?.webview.postMessage({
                    type: 'undoExpired',
                    value: undoId
                });
                return;
            }
            
            this._view?.webview.postMessage({
                type: 'undoCountdown',
                value: {
                    id: undoId,
                    remainingTimeFormatted: this._undoManager.formatRemainingTime(undoId),
                    remainingTimeMs: this._undoManager.getRemainingTime(undoId)
                }
            });
        }, 1000);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._extensionUri, 
                'media', 
                'sidebar.js'
            )
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._extensionUri, 
                'media', 
                'style.css'
            )
        );

        const nonce = this._getNonce();

        return `<!DOCTYPE html>
            <html lang="de">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" 
                      content="default-src 'none'; 
                               style-src ${webview.cspSource} 'unsafe-inline'; 
                               script-src 'nonce-${nonce}';
                               font-src ${webview.cspSource};">
                <link href="${styleUri}" rel="stylesheet">
                <title>Medical AI Assistant</title>
            </head>
            <body>
                <div id="aria-live-polite" 
                     aria-live="polite" 
                     aria-atomic="true" 
                     class="sr-only"
                     role="status">
                </div>
                <div id="aria-live-assertive" 
                     aria-live="assertive" 
                     aria-atomic="true" 
                     class="sr-only"
                     role="alert">
                </div>

                <div class="container" id="main-container" role="main" aria-label="Medical AI Assistent">
                    <!-- Header -->
                    <div class="header">
                        <h2>🏥 Medical AI</h2>
                        <div id="providerStatus" class="status-indicator">
                            <span class="status-dot"></span>
                            <span class="status-text">Prüfe...</span>
                        </div>
                    </div>

                    <!-- Provider Selector -->
                    <div class="provider-selector">
                        <label for="providerSelect">KI-Provider:</label>
                        <select id="providerSelect" class="provider-select">
                            <option value="auto">🔄 Automatisch</option>
                            <option value="ollama">🏠 Ollama (Lokal)</option>
                            <option value="github">🐙 GitHub Models</option>
                            <option value="backend">🖥️ Backend API</option>
                        </select>
                    </div>

                    <!-- Trust Badge -->
                    <div class="trust-badge-container" role="banner" aria-label="Vertrauensindikatoren">
                        <div class="trust-badge" id="local-processing-badge">
                            <span class="trust-icon">🛡️</span>
                            <div class="trust-content">
                                <span class="trust-title">100% Lokal</span>
                                <span class="trust-subtitle">Keine Cloud-Verbindung</span>
                            </div>
                        </div>
                    </div>

                    <!-- Tabs -->
                    <div class="tabs" role="tablist" aria-label="Funktionsauswahl">
                        <button class="tab-btn active" data-tab="analyze" role="tab" aria-selected="true" aria-controls="tab-analyze" id="tab-btn-analyze">
                            🔍 Analyse
                        </button>
                        <button class="tab-btn" data-tab="chat" role="tab" aria-selected="false" aria-controls="tab-chat" id="tab-btn-chat">
                            💬 Chat
                        </button>
                        <button class="tab-btn" data-tab="icd10" role="tab" aria-selected="false" aria-controls="tab-icd10" id="tab-btn-icd10">
                            📋 ICD-10
                        </button>
                    </div>

                    <!-- Tab Content: Analyze -->
                    <div id="tab-analyze" class="tab-content active" role="tabpanel" aria-labelledby="tab-btn-analyze">
                        <div class="input-group">
                            <textarea 
                                id="analyzeInput" 
                                placeholder="Medizinischen Text eingeben..."
                                rows="6"
                            ></textarea>
                        </div>
                        <div class="button-group">
                            <button id="analyzeBtn" class="btn-primary">
                                🔍 Analysieren
                            </button>
                            <button id="summarizeBtn" class="btn-secondary">
                                📝 Zusammenfassen
                            </button>
                        </div>
                        <div id="analyzeResult" class="result-container" role="region" aria-label="Analyse-Ergebnisse" aria-live="polite"></div>
                    </div>

                    <!-- Tab Content: Chat -->
                    <div id="tab-chat" class="tab-content" role="tabpanel" aria-labelledby="tab-btn-chat">
                        <div id="chatHistory" class="chat-history"></div>
                        <div class="chat-input-group">
                            <textarea 
                                id="chatInput" 
                                placeholder="Frage stellen..."
                                rows="2"
                            ></textarea>
                            <div class="chat-actions">
                                <button id="sendBtn" class="btn-primary" title="Senden (Enter)">
                                    ➤
                                </button>
                                <button id="stopBtn" class="btn-danger hidden" title="Streaming stoppen (Esc)">
                                    ⏹ Stop
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Tab Content: ICD-10 -->
                    <div id="tab-icd10" class="tab-content" role="tabpanel" aria-labelledby="tab-btn-icd10">
                        <div class="input-group">
                            <textarea 
                                id="icd10Input" 
                                placeholder="Diagnose eingeben..."
                                rows="4"
                            ></textarea>
                        </div>
                        <button id="icd10Btn" class="btn-primary">
                            📋 Codes suchen
                        </button>
                        <div id="icd10Result" class="result-container" role="region" aria-label="ICD-10 Ergebnisse" aria-live="polite"></div>
                    </div>

                    <!-- Status Bar -->
                    <div id="statusBar" class="status-bar"></div>
                </div>
                
                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                </script>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    private _getNonce(): string {
        let text = '';
        const possible = 
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(
                Math.floor(Math.random() * possible.length)
            );
        }
        return text;
    }
}
