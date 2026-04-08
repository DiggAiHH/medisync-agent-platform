/**
 * GitHub Models Service
 * Fallback-Service für GitHub Models API als Alternative zu Ollama
 * https://github.com/marketplace/models
 */

import * as vscode from 'vscode';
import { 
    JsonParseError, 
    withRetry, 
    DEFAULT_RETRY_CONFIG 
} from '../errors/MedicalAiError';
import { validateAnalysisResult, flexibleJsonParse } from '../utils/jsonValidator';
import { AnalysisResult } from './ollamaService';
import { Message } from '../utils/streamingManager';

export interface GitHubModelsConfig {
    endpoint: string;
    token: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
}

export class GitHubModelsService implements vscode.Disposable {
    private config: GitHubModelsConfig;
    private disposables: vscode.Disposable[] = [];

    constructor(config?: Partial<GitHubModelsConfig>) {
        this.config = this.loadConfig(config);
    }

    private loadConfig(overrides?: Partial<GitHubModelsConfig>): GitHubModelsConfig {
        const vscodeConfig = vscode.workspace.getConfiguration('medicalAi');
        
        return {
            endpoint: overrides?.endpoint 
                || process.env.GITHUB_MODELS_ENDPOINT 
                || 'https://models.inference.ai.azure.com',
            token: overrides?.token 
                || process.env.GITHUB_TOKEN 
                || vscodeConfig.get<string>('githubToken') 
                || '',
            model: overrides?.model 
                || process.env.GITHUB_MODELS_MODEL 
                || vscodeConfig.get<string>('githubModel') 
                || 'gpt-4o-mini',
            temperature: overrides?.temperature 
                || vscodeConfig.get<number>('temperature') 
                || 0.3,
            maxTokens: overrides?.maxTokens 
                || vscodeConfig.get<number>('maxTokens') 
                || 1000
        };
    }

    /**
     * Prüft ob GitHub Models konfiguriert ist
     */
    public isConfigured(): boolean {
        return !!this.config.token && this.config.token.length > 0;
    }

    /**
     * Prüft die Verbindung zu GitHub Models
     */
    public async checkConnection(): Promise<{ available: boolean; message?: string }> {
        if (!this.isConfigured()) {
            return { 
                available: false, 
                message: 'GitHub Token nicht konfiguriert. Setzen Sie GITHUB_TOKEN Umgebungsvariable oder medicalAi.githubToken Einstellung.' 
            };
        }

        try {
            const response = await fetch(`${this.config.endpoint}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                return { available: true };
            } else {
                const errorText = await response.text();
                return { 
                    available: false, 
                    message: `GitHub Models API Fehler: ${response.status} - ${errorText}` 
                };
            }
        } catch (error) {
            return { 
                available: false, 
                message: `Verbindungsfehler: ${error instanceof Error ? error.message : String(error)}` 
            };
        }
    }

    /**
     * Chat Completion mit GitHub Models
     */
    public async chat(messages: Message[]): Promise<string> {
        if (!this.isConfigured()) {
            throw new Error('GitHub Models nicht konfiguriert. Bitte GITHUB_TOKEN setzen.');
        }

        return await withRetry(
            async () => {
                const response = await fetch(`${this.config.endpoint}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.config.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: this.config.model,
                        messages: messages,
                        temperature: this.config.temperature,
                        max_tokens: this.config.maxTokens,
                        stream: false
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`GitHub Models API Fehler: ${response.status} - ${errorText}`);
                }

                const data = await response.json() as {
                    choices: Array<{ message: { content: string } }>;
                };
                
                return data.choices[0]?.message?.content || '';
            },
            { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2 }
        );
    }

    /**
     * Streaming Chat mit GitHub Models
     */
    public async *streamChat(messages: Message[]): AsyncGenerator<string> {
        if (!this.isConfigured()) {
            throw new Error('GitHub Models nicht konfiguriert. Bitte GITHUB_TOKEN setzen.');
        }

        const response = await fetch(`${this.config.endpoint}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.config.model,
                messages: messages,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens,
                stream: true
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GitHub Models API Fehler: ${response.status} - ${errorText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('Stream konnte nicht gelesen werden');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('data: ')) {
                        const data = trimmed.slice(6);
                        if (data === '[DONE]') return;
                        
                        try {
                            const parsed = JSON.parse(data) as {
                                choices?: Array<{ delta?: { content?: string } }>;
                            };
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) {
                                yield content;
                            }
                        } catch {
                            // Ungültiges JSON, überspringen
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Medizinischen Text analysieren
     */
    public async analyzeMedicalText(text: string, retryCount: number = 0): Promise<AnalysisResult> {
        const vscodeConfig = vscode.workspace.getConfiguration('medicalAi');
        const customPrompts = vscodeConfig.get<{ analyze: string }>('customPrompts') 
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
        
        const jsonHint = retryCount > 0 
            ? '\n\nWICHTIG: Antworte NUR mit einem gültigen JSON-Objekt, keine Markdown-Formatierung!' 
            : '';
        
        const prompt = `${basePrompt}${jsonHint}\n\n${text}`;

        const messages: Message[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ];

        try {
            const response = await this.chat(messages);
            
            try {
                const parsed = flexibleJsonParse(response);
                return validateAnalysisResult(parsed);
            } catch (parseError) {
                if (retryCount < 2) {
                    console.warn(`JSON-Parsing fehlgeschlagen (Versuch ${retryCount + 1}), retry...`);
                    return this.analyzeMedicalText(text, retryCount + 1);
                }
                
                return {
                    summary: response.trim(),
                    keyPoints: ['(Automatische Strukturierung fehlgeschlagen - Rohausgabe)'],
                    suggestions: []
                };
            }
        } catch (error) {
            throw new Error(`Analyse fehlgeschlagen: ${error}`);
        }
    }

    /**
     * Bericht zusammenfassen
     */
    public async summarizeReport(text: string): Promise<string> {
        const vscodeConfig = vscode.workspace.getConfiguration('medicalAi');
        const customPrompts = vscodeConfig.get<{ summarize: string }>('customPrompts') 
            || { summarize: '' };

        const systemPrompt = `Du bist ein medizinischer Assistent. Fasse medizinische Berichte prägnant zusammen.`;

        const prompt = `${customPrompts.summarize || 'Fasse den folgenden medizinischen Bericht zusammen:'}\n\n${text}`;

        const messages: Message[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ];

        return await this.chat(messages);
    }

    /**
     * ICD-10 Codes vorschlagen
     */
    public async suggestICD10(diagnosis: string): Promise<string[]> {
        const vscodeConfig = vscode.workspace.getConfiguration('medicalAi');
        const customPrompts = vscodeConfig.get<{ icd10: string }>('customPrompts') 
            || { icd10: '' };

        const systemPrompt = `Du bist ein medizinischer Kodierer. Schlage passende ICD-10 Codes vor. 
Gib nur die Codes zurück, eines pro Zeile, im Format: CODE - Beschreibung`;

        const prompt = `${customPrompts.icd10 || 'Schlage passende ICD-10 Codes für folgende Diagnose vor:'}\n\n${diagnosis}`;

        const messages: Message[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ];

        const response = await this.chat(messages);
        return response.split('\n').filter(line => line.trim());
    }

    /**
     * Verfügbare Modelle abrufen
     */
    public async listModels(): Promise<string[]> {
        if (!this.isConfigured()) {
            return [];
        }

        try {
            const response = await fetch(`${this.config.endpoint}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                return [];
            }

            const data = await response.json() as {
                data?: Array<{ id: string }>;
            };
            
            return (data.data || []).map(m => m.id);
        } catch (error) {
            console.error('Fehler beim Abrufen der Modelle:', error);
            return [];
        }
    }

    /**
     * Aktuelles Modell abrufen
     */
    public getCurrentModel(): string {
        return this.config.model;
    }

    /**
     * Modell ändern
     */
    public async setModel(modelName: string): Promise<boolean> {
        this.config.model = modelName;
        
        // Persistiere in VS Code Settings
        const vscodeConfig = vscode.workspace.getConfiguration('medicalAi');
        await vscodeConfig.update('githubModel', modelName, true);
        
        return true;
    }

    /**
     * Konfiguration neu laden
     */
    public reloadConfig(): void {
        this.config = this.loadConfig();
    }

    /**
     * Cleanup
     */
    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
