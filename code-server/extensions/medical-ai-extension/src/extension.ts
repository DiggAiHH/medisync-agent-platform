import * as vscode from 'vscode';
import { MedicalPanelProvider } from './providers/sidebarProvider';
import { LLMService, LLMProvider, ProviderStatus } from './services/llmService';
import { MedicalAiError, normalizeError } from './errors/MedicalAiError';

// Konstanten für State Management
const CHAT_HISTORY_KEY = 'medicalAi.chatHistory';
const MAX_CHAT_HISTORY = 100; // Maximale Anzahl gespeicherter Nachrichten

export function activate(context: vscode.ExtensionContext) {
    console.log('Medical AI Extension (Code-Server Edition) wird aktiviert...');

    // Services initialisieren
    const llmService = new LLMService();

    // Chat-Historie aus globalState laden
    const savedChatHistory = loadChatHistory(context);

    // Sidebar Provider registrieren (mit Chat-Historie)
    const sidebarProvider = new MedicalPanelProvider(
        context.extensionUri,
        llmService,
        context, // Übergabe des Extension Context für State Management
        savedChatHistory
    );
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            MedicalPanelProvider.viewType,
            sidebarProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

    // Befehle registrieren
    registerCommands(context, sidebarProvider, llmService);

    // Status Bar Item
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = "$(sparkle) Medical AI";
    statusBarItem.tooltip = "Medical AI Assistant öffnen";
    statusBarItem.command = 'medicalAi.openPanel';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Chat-Historie speichern wenn Nachrichten gesendet werden
    setupChatPersistence(context, sidebarProvider);

    // Provider-Status beim Start prüfen
    checkProvidersOnStartup(llmService);

    console.log('Medical AI Extension erfolgreich aktiviert!');
}

/**
 * Prüft Provider-Status beim Start und zeigt Info
 */
async function checkProvidersOnStartup(llmService: LLMService): Promise<void> {
    try {
        const statuses = await llmService.checkAllProviders();
        const availableProviders = statuses.filter(s => s.available);
        
        console.log('Verfügbare LLM Provider:', availableProviders.map(p => p.provider).join(', '));
        
        if (availableProviders.length === 0) {
            vscode.window.showWarningMessage(
                'Medical AI: Kein LLM Provider verfügbar. Bitte Ollama starten oder GitHub Token konfigurieren.',
                'Konfigurieren'
            ).then(selection => {
                if (selection === 'Konfigurieren') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'medicalAi');
                }
            });
        } else {
            const primaryProvider = availableProviders[0];
            vscode.window.setStatusBarMessage(
                `$(check) Medical AI: ${primaryProvider.provider} (${primaryProvider.model || 'ready'})`,
                5000
            );
        }
    } catch (error) {
        console.error('Fehler beim Provider-Check:', error);
    }
}

/**
 * Lädt die Chat-Historie aus dem globalState
 */
import { ChatMessage } from './providers/sidebarProvider';

function loadChatHistory(context: vscode.ExtensionContext): ChatMessage[] {
    try {
        const saved = context.globalState.get<ChatMessage[]>(CHAT_HISTORY_KEY, []);
        // Validiere und bereinige die Historie
        return saved
            .filter(msg => msg && typeof msg.content === 'string' && (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'))
            .slice(-MAX_CHAT_HISTORY); // Nur die letzten N Nachrichten behalten
    } catch (error) {
        console.error('Fehler beim Laden der Chat-Historie:', error);
        return [];
    }
}

/**
 * Speichert die Chat-Historie im globalState
 */
export async function saveChatHistory(
    context: vscode.ExtensionContext, 
    history: Array<{role: string, content: string}>
): Promise<void> {
    try {
        // Begrenze auf maximale Größe
        const trimmedHistory = history.slice(-MAX_CHAT_HISTORY);
        await context.globalState.update(CHAT_HISTORY_KEY, trimmedHistory);
    } catch (error) {
        console.error('Fehler beim Speichern der Chat-Historie:', error);
    }
}

/**
 * Richtet die Chat-Persistence ein - speichert Historie bei Änderungen
 */
function setupChatPersistence(
    context: vscode.ExtensionContext,
    sidebarProvider: MedicalPanelProvider
): void {
    // Event-Handler für Chat-Updates
    const disposable = sidebarProvider.onDidChangeChatHistory((history) => {
        saveChatHistory(context, history);
    });
    context.subscriptions.push(disposable);
}

function registerCommands(
    context: vscode.ExtensionContext,
    sidebarProvider: MedicalPanelProvider,
    llmService: LLMService
) {
    // Panel öffnen
    context.subscriptions.push(
        vscode.commands.registerCommand('medicalAi.openPanel', async () => {
            await vscode.commands.executeCommand(
                'workbench.view.extension.medicalAiSidebar'
            );
        })
    );

    // Ausgewählten Text analysieren
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'medicalAi.analyzeSelection',
            async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage(
                        'Kein aktiver Editor gefunden'
                    );
                    return;
                }

                const selection = editor.document.getText(editor.selection);
                if (!selection) {
                    vscode.window.showWarningMessage(
                        'Bitte Text auswählen'
                    );
                    return;
                }

                // Panel öffnen und Analyse starten
                await vscode.commands.executeCommand(
                    'workbench.view.extension.medicalAiSidebar'
                );
                
                sidebarProvider.analyzeText(selection);
            }
        )
    );

    // Medizinischen Bericht generieren
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'medicalAi.generateReport',
            async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage(
                        'Kein aktiver Editor gefunden'
                    );
                    return;
                }

                const document = editor.document.getText();
                
                // Panel öffnen
                await vscode.commands.executeCommand(
                    'workbench.view.extension.medicalAiSidebar'
                );
                
                sidebarProvider.generateReport(document);
            }
        )
    );

    // Zen Mode umschalten
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'medicalAi.toggleZenMode',
            async () => {
                await vscode.commands.executeCommand(
                    'workbench.action.toggleZenMode'
                );
            }
        )
    );

    // Chat-Historie löschen
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'medicalAi.clearChatHistory',
            async () => {
                await context.globalState.update(CHAT_HISTORY_KEY, []);
                sidebarProvider.clearChatHistory();
                vscode.window.showInformationMessage(
                    'Chat-Historie wurde gelöscht'
                );
            }
        )
    );

    // Befehl: Apply Result to Editor
    context.subscriptions.push(
        vscode.commands.registerCommand('medicalAi.applyToEditor', async (text: string) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && text) {
                await editor.edit(editBuilder => {
                    editBuilder.insert(editor.selection.active, text);
                });
                vscode.window.showInformationMessage('Text in Editor eingefügt');
            }
        })
    );

    // Befehl: Undo Last Apply
    context.subscriptions.push(
        vscode.commands.registerCommand('medicalAi.undoLastApply', async () => {
            // VS Code's native undo
            await vscode.commands.executeCommand('undo');
            vscode.window.showInformationMessage('Letzte Aktion rückgängig gemacht');
        })
    );

    // Befehl: Provider wechseln
    context.subscriptions.push(
        vscode.commands.registerCommand('medicalAi.switchProvider', async () => {
            const providers: { label: string; provider: LLMProvider; description: string }[] = [
                { label: '$(sync) Automatisch', provider: 'auto', description: 'Automatische Auswahl' },
                { label: '$(home) Ollama (lokal)', provider: 'ollama', description: 'Lokale Ollama Instanz' },
                { label: '$(mark-github) GitHub Models', provider: 'github', description: 'GitHub Models API' },
                { label: '$(server) Backend API', provider: 'backend', description: 'Agents-Platform Backend' }
            ];

            const selection = await vscode.window.showQuickPick(providers, {
                placeHolder: 'Wählen Sie einen LLM Provider'
            });

            if (selection) {
                await llmService.setProvider(selection.provider);
                vscode.window.showInformationMessage(`LLM Provider gewechselt zu: ${selection.label}`);
                sidebarProvider.refreshConnectionStatus();
            }
        })
    );

    // Befehl: Provider-Status prüfen
    context.subscriptions.push(
        vscode.commands.registerCommand('medicalAi.checkProviders', async () => {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Prüfe LLM Provider...',
                cancellable: false
            }, async () => {
                const statuses = await llmService.checkAllProviders();
                
                const items = statuses.map(s => {
                    const icon = s.available ? '$(check)' : '$(x)';
                    const model = s.model ? ` (${s.model})` : '';
                    const message = s.message ? ` - ${s.message}` : '';
                    return `${icon} **${s.provider}**${model}${message}`;
                });

                const currentProvider = llmService.getCurrentProvider();
                
                vscode.window.showInformationMessage(
                    `LLM Provider Status (aktuell: ${currentProvider}):\n\n${items.join('\n')}`,
                    { modal: true }
                );
            });
        })
    );

    // Live Konfiguration Reload
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('medicalAi')) {
                console.log('Medical AI Konfiguration wurde geändert - lade neu...');
                
                try {
                    llmService.reloadConfig();
                    
                    // Benachrichtigung nur bei bestimmten Änderungen anzeigen
                    const changedSettings = [
                        'medicalAi.ollamaEndpoint',
                        'medicalAi.modelName',
                        'medicalAi.embeddingModel',
                        'medicalAi.llmProvider',
                        'medicalAi.githubToken',
                        'medicalAi.backendUrl'
                    ];
                    
                    const shouldNotify = changedSettings.some(setting => 
                        e.affectsConfiguration(setting)
                    );
                    
                    if (shouldNotify) {
                        vscode.window.showInformationMessage(
                            'Medical AI Konfiguration aktualisiert'
                        );
                    }
                    
                    // Sofortige Verbindungsprüfung nach Config-Change
                    sidebarProvider.refreshConnectionStatus();
                } catch (error) {
                    const normalizedError = normalizeError(error);
                    vscode.window.showErrorMessage(
                        `Fehler beim Aktualisieren der Konfiguration: ${normalizedError.message}`
                    );
                }
            }
        })
    );
}

export function deactivate() {
    console.log('Medical AI Extension wird deaktiviert...');
}
