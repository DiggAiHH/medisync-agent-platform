/**
 * Backend API Service
 * Service für Kommunikation mit dem agents-platform Backend
 */

import * as vscode from 'vscode';
import { withRetry, DEFAULT_RETRY_CONFIG } from '../errors/MedicalAiError';

export interface BackendConfig {
    baseUrl: string;
    apiKey?: string;
    timeout?: number;
}

export interface PatientSummary {
    id: string;
    name: string;
    dateOfBirth?: string;
    lastVisit?: string;
}

export interface MedicalDocument {
    id: string;
    title: string;
    content: string;
    type: string;
    createdAt: string;
    updatedAt: string;
}

export interface AnalysisRequest {
    text: string;
    type: 'summarize' | 'analyze' | 'icd10';
    patientId?: string;
    context?: string;
}

export interface AnalysisResponse {
    result: string;
    metadata?: {
        confidence?: number;
        processingTime?: number;
        model?: string;
    };
}

export class BackendApiService implements vscode.Disposable {
    private config: BackendConfig;
    private disposables: vscode.Disposable[] = [];

    constructor(config?: Partial<BackendConfig>) {
        this.config = this.loadConfig(config);
    }

    private loadConfig(overrides?: Partial<BackendConfig>): BackendConfig {
        const vscodeConfig = vscode.workspace.getConfiguration('medicalAi');
        
        return {
            baseUrl: overrides?.baseUrl 
                || process.env.BACKEND_API_URL 
                || vscodeConfig.get<string>('backendUrl') 
                || 'http://localhost:3001',
            apiKey: overrides?.apiKey 
                || process.env.BACKEND_API_KEY 
                || vscodeConfig.get<string>('backendApiKey') 
                || '',
            timeout: overrides?.timeout 
                || vscodeConfig.get<number>('backendTimeout') 
                || 30000
        };
    }

    /**
     * Prüft ob Backend konfiguriert ist
     */
    public isConfigured(): boolean {
        return !!this.config.baseUrl;
    }

    /**
     * Prüft die Verbindung zum Backend
     */
    public async checkConnection(): Promise<{ available: boolean; message?: string }> {
        if (!this.isConfigured()) {
            return { 
                available: false, 
                message: 'Backend URL nicht konfiguriert' 
            };
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

            const response = await fetch(`${this.config.baseUrl}/health`, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                return { available: true };
            } else {
                return { 
                    available: false, 
                    message: `Backend Fehler: ${response.status}` 
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
     * Generischer API Request
     */
    private async request<T>(
        endpoint: string, 
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${this.config.baseUrl}${endpoint}`;
        
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...((options.headers as Record<string, string>) || {})
        };

        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        return await withRetry(
            async () => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

                const response = await fetch(url, {
                    ...options,
                    headers,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Backend API Fehler: ${response.status} - ${errorText}`);
                }

                return await response.json() as T;
            },
            { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2 }
        );
    }

    /**
     * Patientenliste abrufen
     */
    public async getPatients(): Promise<PatientSummary[]> {
        return this.request<PatientSummary[]>('/api/patients');
    }

    /**
     * Patientendetails abrufen
     */
    public async getPatient(patientId: string): Promise<PatientSummary> {
        return this.request<PatientSummary>(`/api/patients/${patientId}`);
    }

    /**
     * Dokumente eines Patienten abrufen
     */
    public async getPatientDocuments(patientId: string): Promise<MedicalDocument[]> {
        return this.request<MedicalDocument[]>(`/api/patients/${patientId}/documents`);
    }

    /**
     * Dokument abrufen
     */
    public async getDocument(documentId: string): Promise<MedicalDocument> {
        return this.request<MedicalDocument>(`/api/documents/${documentId}`);
    }

    /**
     * Dokument speichern
     */
    public async saveDocument(
        patientId: string, 
        document: Partial<MedicalDocument>
    ): Promise<MedicalDocument> {
        return this.request<MedicalDocument>(`/api/patients/${patientId}/documents`, {
            method: 'POST',
            body: JSON.stringify(document)
        });
    }

    /**
     * Textanalyse über Backend durchführen
     */
    public async analyzeText(request: AnalysisRequest): Promise<AnalysisResponse> {
        return this.request<AnalysisResponse>('/api/ai/analyze', {
            method: 'POST',
            body: JSON.stringify(request)
        });
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
