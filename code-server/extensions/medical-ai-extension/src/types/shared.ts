/**
 * Shared Types
 * Gemeinsame Typ-Definitionen zwischen Backend und Extension
 */

// Basis-Anfrage-Typen
export interface AnalysisRequest {
    text: string;
    type: 'summarize' | 'analyze' | 'icd10' | 'chat';
    patientId?: string;
    context?: string;
    options?: {
        temperature?: number;
        maxTokens?: number;
        stream?: boolean;
    };
}

export interface AnalysisResponse {
    result: string;
    structured?: {
        summary?: string;
        keyPoints?: string[];
        suggestions?: string[];
    };
    metadata: {
        provider: string;
        model: string;
        processingTime: number;
        confidence?: number;
        tokensUsed?: number;
    };
}

// Patienten-Typen
export interface Patient {
    id: string;
    name: string;
    dateOfBirth?: string;
    insuranceId?: string;
    contact?: {
        phone?: string;
        email?: string;
        address?: string;
    };
    medicalHistory?: string[];
    allergies?: string[];
    medications?: string[];
    createdAt: string;
    updatedAt: string;
}

// Dokumenten-Typen
export interface MedicalDocument {
    id: string;
    patientId: string;
    title: string;
    content: string;
    type: 'report' | 'summary' | 'lab' | 'prescription' | 'note';
    status: 'draft' | 'final' | 'archived';
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    tags?: string[];
}

// Chat-Typen
export interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
    metadata?: {
        provider?: string;
        model?: string;
        processingTime?: number;
    };
}

export interface ChatSession {
    id: string;
    patientId?: string;
    documentId?: string;
    messages: ChatMessage[];
    createdAt: string;
    updatedAt: string;
}

// ICD-10 Typen
export interface ICD10Code {
    code: string;
    description: string;
    category?: string;
    confidence?: number;
}

// Provider-Typen
export interface ProviderConfig {
    name: string;
    type: 'ollama' | 'github' | 'backend' | 'openai';
    endpoint?: string;
    model?: string;
    apiKey?: string;
    enabled: boolean;
    priority: number;
}

// Health Check
export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    version: string;
    uptime: number;
    services: {
        name: string;
        status: 'up' | 'down';
        latency?: number;
    }[];
}

// API Fehler
export interface ApiError {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
}

// WebSocket Nachrichten
export interface WebSocketMessage {
    type: 'chat' | 'analysis' | 'status' | 'error' | 'ping';
    payload: any;
    timestamp: string;
    requestId?: string;
}
