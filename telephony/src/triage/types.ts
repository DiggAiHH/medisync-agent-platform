/**
 * Triage-specific types for the call triage engine.
 */
import { UrgencyLevel, CallIntent } from '../shared/types';

/** Urgency classification result from the LLM */
export interface UrgencyClassification {
  level: UrgencyLevel;
  confidence: number;
  reasoning: string;
  urgencyCues: string[];
}

/** Intent extraction result from the LLM */
export interface IntentExtraction {
  primaryIntent: CallIntent;
  secondaryIntents: CallIntent[];
  confidence: number;
  extractedDetails: {
    patientName?: string;
    dateOfBirth?: string;
    symptoms?: string[];
    medications?: string[];
    requestedDate?: string;
    doctorName?: string;
    insuranceInfo?: string;
    freeText?: string;
  };
}

/** Patient matching candidate */
export interface PatientCandidate {
  name: string;
  dateOfBirth?: string;
  phoneNumber?: string;
  contactId?: string;
  matchScore: number;
  matchMethod: 'exact_phone' | 'fuzzy_name' | 'name_and_dob' | 'phone_and_name';
}

/** Complete empathy analysis from LLM */
export interface EmpathyAnalysis {
  overallSentiment: 'positive' | 'neutral' | 'concerned' | 'distressed' | 'angry';
  distressLevel: number;
  urgencyCues: string[];
  empathyNotes: string;
  recommendedTone: 'warmth' | 'reassurance' | 'urgency' | 'professionalism' | 'calm';
  suggestedResponse?: string;
}

/** Ollama generation request (simplified) */
export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  num_predict?: number;
  format?: 'json';
  stream?: boolean;
}

/** Ollama generation response (simplified) */
export interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}
