/**
 * Ollama Service
 * Haupt-Service für Ollama API Integration
 * Mit Robustem JSON-Parsing, Retry-Mechanismus und Cancellation
 * Unterstützt Umgebungsvariablen für Container/Server-Deployment
 */

import * as vscode from 'vscode';
import { Ollama, ChatResponse } from 'ollama';
import { 
    validateAnalysisResult, 
    flexibleJsonParse 
} from '../utils/jsonValidator';
import { 
    StreamingManager, 
    Message, 
    streamToString 
} from '../utils/streamingManager';
import { checkConnection } from '../utils/connectionCheck';
import { 
    JsonParseError, 
    OllamaConnectionError,
    withRetry, 
    DEFAULT_RETRY_CONFIG 
} from '../errors/MedicalAiError';

export interface AnalysisResult {
    summary: string;
    keyPoints: string[];
    suggestions?: string[];
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

/**
 * Öffentliches Interface für OllamaService
 */
export interface OllamaServiceAPI {
    analyzeMedicalText(text: string): Promise<AnalysisResult>;
    summarizeReport(text: string): Promise<string>;
    suggestICD10(diagnosis: string): Promise<string[]>;
    chat(messages: Message[]): Promise<string>;
    streamChat(messages: Message[]): AsyncGenerator<string>;
    createEmbedding(text: string): Promise<number[]>;
    listModels(): Promise<string[]>;
    
    // Neue Methoden
    setModel(model: string): Promise<boolean>;
    cancelCurrentRequest(): void;
    checkConnection(timeout?: number): Promise<boolean>;
    getCurrentModel(): string;
    getIsAvailable(): boolean;
}

export class OllamaService implements OllamaServiceAPI, vscode.Disposable {
    private ollama: Ollama;
    private config: vscode.WorkspaceConfiguration;
    private isAvailable: boolean = false;
    private currentModel: string = 'llama3.2';
    private streamingManager: StreamingManager;
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.config = vscode.workspace.getConfiguration('medicalAi');
        this.currentModel = this.getModelFromConfig();
        this.loadSavedModel();
        this.ollama = this.createOllamaInstance();
        this.streamingManager = this.createStreamingManager();
        this.checkAvailability();
    }

    /**
     * Holt Ollama Endpoint aus Config oder Umgebungsvariable
     */
    private getEndpointFromConfig(): string {
        // Priorität: VS Code Config > Umgebungsvariable > Default
        return this.config.get<string>('ollamaEndpoint') 
            || process.env.OLLAMA_HOST 
            || process.env.OLLAMA_ENDPOINT
            || 'http://localhost:11434';
    }

    /**
     * Holt Modell aus Config oder Umgebungsvariable
     */
    private getModelFromConfig(): string {
        return this.config.get<string>('modelName') 
            || process.env.OLLAMA_MODEL 
            || 'llama3.2';
    }

    /**
     * Holt Embedding Modell aus Config oder Umgebungsvariable
     */
    private getEmbeddingModelFromConfig(): string {
        return this.config.get<string>('embeddingModel') 
            || process.env.OLLAMA_EMBEDDING_MODEL 
            || 'nomic-embed-text';
    }

    private createOllamaInstance(): Ollama {
        const apiBase = this.getEndpointFromConfig();
        console.log(`Ollama Endpoint: ${apiBase}`);
        return new Ollama({ host: apiBase });
    }

    private createStreamingManager(): StreamingManager {
        const endpoint = this.getEndpointFromConfig();
        return new StreamingManager({
            endpoint,
            model: this.currentModel,
            temperature: this.config.get<number>('temperature') || 0.3,
            maxTokens: this.config.get<number>('maxTokens') || 1000
        });
    }

    public reloadConfig(): void {
        this.config = vscode.workspace.getConfiguration('medicalAi');
        this.currentModel = this.getModelFromConfig();
        this.ollama = this.createOllamaInstance();
        this.streamingManager.dispose();
        this.streamingManager = this.createStreamingManager();
        this.checkAvailability();
    }

    private async checkAvailability(): Promise<void> {
        try {
            await this.ollama.list();
            this.isAvailable = true;
        } catch (error) {
            this.isAvailable = false;
            console.warn('Ollama nicht verfügbar:', error);
        }
    }

    public getIsAvailable(): boolean {
        return this.isAvailable;
    }

    /**
     * Ändert das aktuell verwendete Modell
     * 
     * @param modelName - Name des neuen Modells
     * @returns true wenn erfolgreich, false wenn Modell nicht verfügbar
     */
    public async setModel(modelName: string): Promise<boolean> {
        try {
            // Prüfe ob Modell verfügbar
            const models = await this.listModels();
            const modelExists = models.some(m => m === modelName || m.startsWith(modelName + ':'));
            
            if (!modelExists) {
                console.warn(`Modell "${modelName}" nicht gefunden in Ollama`);
                return false;
            }
            
            // Aktualisiere aktuelles Modell
            this.currentModel = modelName;
            this.streamingManager.updateOptions({ model: modelName });
            
            // Persistiere in VS Code Settings
            const config = vscode.workspace.getConfiguration('medicalAi');
            await config.update('modelName', modelName, true); // true = global
            
            console.log(`Modell gewechselt zu: ${modelName}`);
            return true;
            
        } catch (error) {
            console.error('Fehler beim Modell-Wechsel:', error);
            return false;
        }
    }

    /**
     * Gibt den Namen des aktuell verwendeten Modells zurück
     */
    public getCurrentModel(): string {
        return this.currentModel;
    }

    /**
     * Lädt das gespeicherte Modell aus den Settings beim Start
     */
    private loadSavedModel(): void {
        const config = vscode.workspace.getConfiguration('medicalAi');
        const savedModel = config.get<string>('modelName');
        
        if (savedModel && savedModel !== this.currentModel) {
            console.log(`Gespeichertes Modell geladen: ${savedModel}`);
            this.currentModel = savedModel;
        }
    }

    /**
     * Bricht den aktuellen Request ab
     */
    public cancelCurrentRequest(): void {
        this.streamingManager.cancel();
    }

    /**
     * Prüft die Ollama-Verbindung mit Timeout
     */
    public async checkConnection(timeout?: number): Promise<boolean> {
        const endpoint = this.getEndpointFromConfig();
        const result = await checkConnection(endpoint, timeout);
        this.isAvailable = result.available;
        return result.available;
    }

    /**
     * Generiert eine Antwort basierend auf einem Prompt
     */
    public async generate(
        prompt: string, 
        systemPrompt?: string,
        model?: string
    ): Promise<string> {
        if (!this.isAvailable) {
            throw new OllamaConnectionError('Ollama ist nicht verfügbar');
        }

        const modelName = model || this.currentModel;
        const temperature = this.config.get<number>('temperature') || 0.3;
        const maxTokens = this.config.get<number>('maxTokens') || 1000;

        return await withRetry(
            async () => {
                const response = await this.ollama.generate({
                    model: modelName,
                    prompt: prompt,
                    system: systemPrompt,
                    options: {
                        temperature: temperature,
                        num_predict: maxTokens
                    }
                });
                return response.response;
            },
            { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2 }
        );
    }

    /**
     * Chat mit Kontext
     */
    public async chat(messages: Message[]): Promise<string> {
        if (!this.isAvailable) {
            throw new OllamaConnectionError('Ollama ist nicht verfügbar');
        }

        const temperature = this.config.get<number>('temperature') || 0.3;

        return await withRetry(
            async () => {
                const response = await this.ollama.chat({
                    model: this.currentModel,
                    messages: messages,
                    options: { temperature },
                    stream: false
                });
                return response.message.content;
            },
            { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2 }
        );
    }

    /**
     * Streaming-Chat für Echtzeit-Antworten
     * Verwendet StreamingManager mit Cancellation-Support
     */
    public async *streamChat(messages: Message[]): AsyncGenerator<string> {
        if (!this.isAvailable) {
            throw new OllamaConnectionError('Ollama ist nicht verfügbar');
        }

        yield* this.streamingManager.streamChat(messages);
    }

    /**
     * Medizinischen Text analysieren mit robustem JSON-Parsing
     * Retry-Mechanismus: Max 2 Versuche bei Parsing-Fehlern
     */
    public async analyzeMedicalText(
        text: string, 
        retryCount: number = 0
    ): Promise<AnalysisResult> {
        const customPrompts = this.config.get<{ analyze: string }>('customPrompts') 
            || { analyze: '' };

        const systemPrompt = `Du bist ein medizinischer Assistent. Analysiere medizinische Texte präzise und strukturiert. 
Gib die Antwort ausschließlich im folgenden JSON-Format zurück (kein Markdown, keine Erklärungen):
{
    "summary": "Kurze Zusammenfassung",
    "keyPoints": ["Punkt 1", "Punkt 2"],
    "suggestions": ["Vorschlag 1"]
}`;

        const basePrompt = customPrompts.analyze 
            || 'Analysiere den folgenden medizinischen Text:';
        
        // Bei Retry: Füge JSON-Hinweis hinzu
        const jsonHint = retryCount > 0 
            ? '\n\nWICHTIG: Antworte NUR mit einem gültigen JSON-Objekt, keine Markdown-Formatierung!' 
            : '';
        
        const prompt = `${basePrompt}${jsonHint}\n\n${text}`;

        try {
            const response = await this.generate(prompt, systemPrompt);
            
            try {
                // Versuche flexibles JSON-Parsing
                const parsed = flexibleJsonParse(response);
                return validateAnalysisResult(parsed);
            } catch (parseError) {
                // Retry bei Parsing-Fehler (max 2 Versuche)
                if (retryCount < 2) {
                    console.warn(`JSON-Parsing fehlgeschlagen (Versuch ${retryCount + 1}), retry...`);
                    return this.analyzeMedicalText(text, retryCount + 1);
                }
                
                // Finaler Fallback: Unstrukturierte Ausgabe
                console.warn('JSON-Parsing nach 3 Versuchen fehlgeschlagen, verwende Fallback');
                return {
                    summary: response.trim(),
                    keyPoints: ['(Automatische Strukturierung fehlgeschlagen - Rohausgabe)'],
                    suggestions: []
                };
            }
        } catch (error) {
            if (error instanceof JsonParseError) {
                throw error;
            }
            throw new Error(`Analyse fehlgeschlagen: ${error}`);
        }
    }

    /**
     * Bericht zusammenfassen
     */
    public async summarizeReport(text: string): Promise<string> {
        const customPrompts = this.config.get<{ summarize: string }>('customPrompts') 
            || { summarize: '' };

        const systemPrompt = `Du bist ein medizinischer Assistent. Fasse medizinische Berichte prägnant zusammen.`;

        const prompt = `${customPrompts.summarize || 'Fasse den folgenden medizinischen Bericht zusammen:'}\n\n${text}`;

        return await this.generate(prompt, systemPrompt);
    }

    /**
     * ICD-10 Codes vorschlagen
     */
    public async suggestICD10(diagnosis: string): Promise<string[]> {
        const customPrompts = this.config.get<{ icd10: string }>('customPrompts') 
            || { icd10: '' };

        const systemPrompt = `Du bist ein medizinischer Kodierer. Schlage passende ICD-10 Codes vor. 
Gib nur die Codes zurück, eines pro Zeile, im Format: CODE - Beschreibung`;

        const prompt = `${customPrompts.icd10 || 'Schlage passende ICD-10 Codes für folgende Diagnose vor:'}\n\n${diagnosis}`;

        const response = await this.generate(prompt, systemPrompt);
        return response.split('\n').filter(line => line.trim());
    }

    /**
     * Verfügbare Modelle abrufen
     */
    public async listModels(): Promise<string[]> {
        if (!this.isAvailable) {
            return [];
        }

        try {
            const response = await this.ollama.list();
            return response.models.map(m => m.name);
        } catch (error) {
            console.error('Fehler beim Abrufen der Modelle:', error);
            return [];
        }
    }

    /**
     * Embeddings für RAG erstellen
     */
    public async createEmbedding(text: string): Promise<number[]> {
        if (!this.isAvailable) {
            throw new OllamaConnectionError('Ollama ist nicht verfügbar');
        }

        const embeddingModel = this.getEmbeddingModelFromConfig();

        return await withRetry(
            async () => {
                const response = await this.ollama.embeddings({
                    model: embeddingModel,
                    prompt: text
                });
                return response.embedding;
            },
            { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2 }
        );
    }

    /**
     * Cleanup
     */
    public dispose(): void {
        this.streamingManager.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
