/**
 * Unified LLM Service
 * Kombiniert Ollama, GitHub Models und Backend API zu einem einheitlichen Interface
 * Priorität: Ollama (lokal) > Backend API > GitHub Models (Fallback)
 */

import * as vscode from 'vscode';
import { OllamaService, AnalysisResult } from './ollamaService';
import { GitHubModelsService } from './githubModelsService';
import { BackendApiService, AnalysisRequest } from './backendApiService';
import { Message } from '../utils/streamingManager';

export type LLMProvider = 'ollama' | 'github' | 'backend' | 'auto';

export interface LLMConfig {
    provider: LLMProvider;
    preferLocal: boolean;
    enableFallback: boolean;
}

export interface ProviderStatus {
    provider: LLMProvider;
    available: boolean;
    message?: string;
    model?: string;
}

export class LLMService implements vscode.Disposable {
    private ollamaService: OllamaService;
    private githubService: GitHubModelsService;
    private backendService: BackendApiService;
    private config: LLMConfig;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.ollamaService = new OllamaService();
        this.githubService = new GitHubModelsService();
        this.backendService = new BackendApiService();
        this.config = this.loadConfig();
        
        this.disposables.push(this.ollamaService, this.githubService, this.backendService);
    }

    private loadConfig(): LLMConfig {
        const vscodeConfig = vscode.workspace.getConfiguration('medicalAi');
        
        return {
            provider: (process.env.LLM_PROVIDER as LLMProvider) 
                || vscodeConfig.get<LLMProvider>('llmProvider') 
                || 'auto',
            preferLocal: vscodeConfig.get<boolean>('preferLocalLLM') ?? true,
            enableFallback: vscodeConfig.get<boolean>('enableLLMFallback') ?? true
        };
    }

    /**
     * Bestimmt den besten verfügbaren Provider
     */
    private async determineProvider(preferred?: LLMProvider): Promise<LLMProvider> {
        const provider = preferred || this.config.provider;
        
        if (provider !== 'auto') {
            const status = await this.checkProviderStatus(provider);
            if (status.available) {
                return provider;
            }
            if (!this.config.enableFallback) {
                throw new Error(`Provider ${provider} nicht verfügbar und Fallback deaktiviert`);
            }
        }

        // Auto-Detection mit Priorität
        const checkOrder: LLMProvider[] = this.config.preferLocal 
            ? ['ollama', 'backend', 'github']
            : ['backend', 'ollama', 'github'];

        for (const p of checkOrder) {
            const status = await this.checkProviderStatus(p);
            if (status.available) {
                return p;
            }
        }

        throw new Error('Kein LLM Provider verfügbar. Bitte konfigurieren Sie Ollama, Backend API oder GitHub Token.');
    }

    /**
     * Prüft Status eines spezifischen Providers
     */
    public async checkProviderStatus(provider: LLMProvider): Promise<ProviderStatus> {
        switch (provider) {
            case 'ollama': {
                const available = await this.ollamaService.checkConnection(5000);
                return {
                    provider: 'ollama',
                    available,
                    model: this.ollamaService.getCurrentModel()
                };
            }
            case 'github': {
                const result = await this.githubService.checkConnection();
                return {
                    provider: 'github',
                    available: result.available,
                    message: result.message,
                    model: this.githubService.getCurrentModel()
                };
            }
            case 'backend': {
                const result = await this.backendService.checkConnection();
                return {
                    provider: 'backend',
                    available: result.available,
                    message: result.message
                };
            }
            default:
                return { provider: 'auto', available: false };
        }
    }

    /**
     * Prüft Status aller Provider
     */
    public async checkAllProviders(): Promise<ProviderStatus[]> {
        const providers: LLMProvider[] = ['ollama', 'backend', 'github'];
        return Promise.all(providers.map(p => this.checkProviderStatus(p)));
    }

    /**
     * Chat mit automatischer Provider-Auswahl
     */
    public async chat(messages: Message[], preferredProvider?: LLMProvider): Promise<string> {
        const provider = await this.determineProvider(preferredProvider);
        
        switch (provider) {
            case 'ollama':
                return this.ollamaService.chat(messages);
            case 'github':
                return this.githubService.chat(messages);
            case 'backend':
                const response = await this.backendService.analyzeText({
                    text: messages[messages.length - 1]?.content || '',
                    type: 'analyze',
                    context: messages.slice(0, -1).map(m => `${m.role}: ${m.content}`).join('\n')
                });
                return response.result;
            default:
                throw new Error('Kein Provider verfügbar');
        }
    }

    /**
     * Streaming Chat
     */
    public async *streamChat(messages: Message[], preferredProvider?: LLMProvider): AsyncGenerator<string> {
        const provider = await this.determineProvider(preferredProvider);
        
        switch (provider) {
            case 'ollama':
                yield* this.ollamaService.streamChat(messages);
                break;
            case 'github':
                yield* this.githubService.streamChat(messages);
                break;
            case 'backend':
                // Backend unterstützt kein Streaming -> reguläre Antwort
                const response = await this.backendService.analyzeText({
                    text: messages[messages.length - 1]?.content || '',
                    type: 'analyze',
                    context: messages.slice(0, -1).map(m => `${m.role}: ${m.content}`).join('\n')
                });
                yield response.result;
                break;
            default:
                throw new Error('Kein Provider verfügbar');
        }
    }

    /**
     * Medizinischen Text analysieren
     */
    public async analyzeMedicalText(
        text: string, 
        preferredProvider?: LLMProvider
    ): Promise<AnalysisResult> {
        const provider = await this.determineProvider(preferredProvider);
        
        switch (provider) {
            case 'ollama':
                return this.ollamaService.analyzeMedicalText(text);
            case 'github':
                return this.githubService.analyzeMedicalText(text);
            case 'backend':
                const response = await this.backendService.analyzeText({
                    text,
                    type: 'analyze'
                });
                // Versuche JSON zu parsen
                try {
                    const parsed = JSON.parse(response.result);
                    return {
                        summary: parsed.summary || response.result,
                        keyPoints: parsed.keyPoints || [],
                        suggestions: parsed.suggestions || []
                    };
                } catch {
                    return {
                        summary: response.result,
                        keyPoints: [],
                        suggestions: []
                    };
                }
            default:
                throw new Error('Kein Provider verfügbar');
        }
    }

    /**
     * Bericht zusammenfassen
     */
    public async summarizeReport(text: string, preferredProvider?: LLMProvider): Promise<string> {
        const provider = await this.determineProvider(preferredProvider);
        
        switch (provider) {
            case 'ollama':
                return this.ollamaService.summarizeReport(text);
            case 'github':
                return this.githubService.summarizeReport(text);
            case 'backend':
                const response = await this.backendService.analyzeText({
                    text,
                    type: 'summarize'
                });
                return response.result;
            default:
                throw new Error('Kein Provider verfügbar');
        }
    }

    /**
     * ICD-10 Codes vorschlagen
     */
    public async suggestICD10(diagnosis: string, preferredProvider?: LLMProvider): Promise<string[]> {
        const provider = await this.determineProvider(preferredProvider);
        
        switch (provider) {
            case 'ollama':
                return this.ollamaService.suggestICD10(diagnosis);
            case 'github':
                return this.githubService.suggestICD10(diagnosis);
            case 'backend':
                const response = await this.backendService.analyzeText({
                    text: diagnosis,
                    type: 'icd10'
                });
                return response.result.split('\n').filter(line => line.trim());
            default:
                throw new Error('Kein Provider verfügbar');
        }
    }

    /**
     * Verfügbare Modelle abrufen (aggregiert von allen Providern)
     */
    public async listAllModels(): Promise<Record<LLMProvider, string[]>> {
        const [ollamaModels, githubModels] = await Promise.all([
            this.ollamaService.listModels(),
            this.githubService.listModels()
        ]);

        return {
            ollama: ollamaModels,
            github: githubModels,
            backend: ['backend-api'],
            auto: [...ollamaModels, ...githubModels]
        };
    }

    /**
     * Aktuellen Provider abrufen
     */
    public getCurrentProvider(): LLMProvider {
        return this.config.provider;
    }

    /**
     * Provider manuell setzen
     */
    public async setProvider(provider: LLMProvider): Promise<void> {
        this.config.provider = provider;
        const vscodeConfig = vscode.workspace.getConfiguration('medicalAi');
        await vscodeConfig.update('llmProvider', provider, true);
    }

    /**
     * Konfiguration neu laden
     */
    public reloadConfig(): void {
        this.config = this.loadConfig();
        this.ollamaService.reloadConfig();
        this.githubService.reloadConfig();
        this.backendService.reloadConfig();
    }

    /**
     * Cancellation Support
     */
    public cancelCurrentRequest(): void {
        this.ollamaService.cancelCurrentRequest();
        // GitHub Models und Backend haben keine Cancellation
    }

    /**
     * Cleanup
     */
    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
