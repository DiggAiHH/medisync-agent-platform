/**
 * Model Router für kostenoptimierte Modell-Auswahl
 * 
 * Strategie:
 * - Einfache Tasks: gemini-2.0-flash (0.25x Multiplier)
 * - Standard Tasks: gpt-4.1 (1x)
 * - Komplexe Tasks: claude-3.7-sonnet (1x)
 * - Fallback: gpt-4o-mini
 */

import {
  GitHubModel,
  TaskComplexity,
  ModelConfig,
  RouterConfig,
  Message,
} from './types';

// Modell-Konfigurationen mit Metadaten
export const MODEL_CONFIGS: Record<GitHubModel, ModelConfig> = {
  // OpenAI Models
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    costMultiplier: 1.25,
    maxTokens: 4096,
    contextWindow: 128000,
    supportsStreaming: true,
    supportsTools: true,
    recommendedFor: ['standard', 'complex'],
  },
  'gpt-4.1': {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    provider: 'openai',
    costMultiplier: 1.0,
    maxTokens: 4096,
    contextWindow: 128000,
    supportsStreaming: true,
    supportsTools: true,
    recommendedFor: ['standard', 'complex'],
  },
  'gpt-4.5': {
    id: 'gpt-4.5',
    name: 'GPT-4.5',
    provider: 'openai',
    costMultiplier: 3.0,
    maxTokens: 4096,
    contextWindow: 128000,
    supportsStreaming: true,
    supportsTools: true,
    recommendedFor: ['complex'],
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    costMultiplier: 0.075,
    maxTokens: 4096,
    contextWindow: 128000,
    supportsStreaming: true,
    supportsTools: true,
    recommendedFor: ['simple', 'fallback'],
  },
  // Anthropic Models
  'claude-3.5-sonnet': {
    id: 'claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    costMultiplier: 1.5,
    maxTokens: 4096,
    contextWindow: 200000,
    supportsStreaming: true,
    supportsTools: true,
    recommendedFor: ['standard', 'complex'],
  },
  'claude-3.7-sonnet': {
    id: 'claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    costMultiplier: 1.0,
    maxTokens: 4096,
    contextWindow: 200000,
    supportsStreaming: true,
    supportsTools: true,
    recommendedFor: ['standard', 'complex'],
  },
  'claude-opus-4': {
    id: 'claude-opus-4',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    costMultiplier: 5.0,
    maxTokens: 4096,
    contextWindow: 200000,
    supportsStreaming: true,
    supportsTools: true,
    recommendedFor: ['complex'],
  },
  // Google Models
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    costMultiplier: 0.25,
    maxTokens: 4096,
    contextWindow: 1000000,
    supportsStreaming: true,
    supportsTools: true,
    recommendedFor: ['simple', 'standard'],
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    costMultiplier: 1.25,
    maxTokens: 4096,
    contextWindow: 1000000,
    supportsStreaming: true,
    supportsTools: true,
    recommendedFor: ['standard', 'complex'],
  },
  // Meta Models
  'llama-4': {
    id: 'llama-4',
    name: 'Llama 4',
    provider: 'meta',
    costMultiplier: 0.5,
    maxTokens: 4096,
    contextWindow: 128000,
    supportsStreaming: true,
    supportsTools: false,
    recommendedFor: ['simple', 'standard'],
  },
};

// Standard Router Konfiguration
const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  defaultModel: 'gpt-4.1',
  fallbackModel: 'gpt-4o-mini',
  complexityThresholds: {
    simple: 500,      // < 500 Tokens = simple
    standard: 2000,   // 500-2000 Tokens = standard
  },
  keywordMappings: {
    // Einfache Tasks
    'übersetze': 'simple',
    'zusammenfassen': 'simple',
    'kürzen': 'simple',
    'formatieren': 'simple',
    'klassifiziere': 'simple',
    'extrahiere': 'simple',
    'liste': 'simple',
    'simple': 'simple',
    'einfach': 'simple',
    
    // Komplexe Tasks
    'analysiere': 'complex',
    'analyse': 'complex',
    'debug': 'complex',
    'debugging': 'complex',
    'refactor': 'complex',
    'architektur': 'complex',
    'design': 'complex',
    'planung': 'complex',
    'strategie': 'complex',
    'complex': 'complex',
    'komplex': 'complex',
    'schwierig': 'complex',
    'kritisch': 'complex',
    'wichtig': 'complex',
  },
};

/**
 * Berechnet die Komplexität basierend auf Prompt-Länge und Keywords
 */
export function analyzeComplexity(
  messages: Message[],
  config: Partial<RouterConfig> = {}
): TaskComplexity {
  const fullConfig = { ...DEFAULT_ROUTER_CONFIG, ...config };
  const combinedText = messages.map(m => m.content.toLowerCase()).join(' ');
  
  // Berechne geschätzte Token-Anzahl (ca. 4 Zeichen pro Token)
  const estimatedTokens = Math.ceil(combinedText.length / 4);

  // Prüfe auf Keywords für komplexe Tasks
  const complexKeywords = Object.entries(fullConfig.keywordMappings)
    .filter(([_, complexity]) => complexity === 'complex')
    .map(([keyword]) => keyword);
  
  const hasComplexKeywords = complexKeywords.some(keyword => 
    combinedText.includes(keyword)
  );

  // Prüfe auf Keywords für einfache Tasks
  const simpleKeywords = Object.entries(fullConfig.keywordMappings)
    .filter(([_, complexity]) => complexity === 'simple')
    .map(([keyword]) => keyword);
  
  const hasSimpleKeywords = simpleKeywords.some(keyword => 
    combinedText.includes(keyword)
  );

  // Priorität: Complex Keywords > Token Count > Simple Keywords
  if (hasComplexKeywords) {
    return 'complex';
  }

  if (estimatedTokens > fullConfig.complexityThresholds.standard) {
    return 'complex';
  }

  if (hasSimpleKeywords || estimatedTokens < fullConfig.complexityThresholds.simple) {
    return 'simple';
  }

  return 'standard';
}

/**
 * Wählt das optimale Modell basierend auf Komplexität und Anforderungen
 */
export function selectModel(
  complexity: TaskComplexity,
  requirements?: {
    requiresTools?: boolean;
    preferredProvider?: 'openai' | 'anthropic' | 'google' | 'meta';
    maxCostMultiplier?: number;
    contextLength?: number;
  }
): GitHubModel {
  const { fallbackModel } = DEFAULT_ROUTER_CONFIG;

  // Filtere Modelle basierend auf Anforderungen
  let candidates = Object.values(MODEL_CONFIGS).filter(config => {
    // Prüfe ob Modell für diese Komplexität empfohlen
    if (!config.recommendedFor.includes(complexity)) {
      return false;
    }

    // Prüfe Tool-Support
    if (requirements?.requiresTools && !config.supportsTools) {
      return false;
    }

    // Prüfe Provider Präferenz
    if (requirements?.preferredProvider && config.provider !== requirements.preferredProvider) {
      return false;
    }

    // Prüfe Kosten-Limit
    if (requirements?.maxCostMultiplier && config.costMultiplier > requirements.maxCostMultiplier) {
      return false;
    }

    // Prüfe Context Window
    if (requirements?.contextLength && config.contextWindow < requirements.contextLength) {
      return false;
    }

    return true;
  });

  // Fallback wenn keine Kandidaten gefunden
  if (candidates.length === 0) {
    // Versuche ohne Provider-Präferenz
    if (requirements?.preferredProvider) {
      return selectModel(complexity, { ...requirements, preferredProvider: undefined });
    }
    // Fallback auf gpt-4o-mini
    return fallbackModel;
  }

  // Sortiere nach Cost Multiplier (aufsteigend)
  candidates.sort((a, b) => a.costMultiplier - b.costMultiplier);

  // Bei einfachen Tasks: Wähle das günstigste Modell
  if (complexity === 'simple') {
    return candidates[0].id;
  }

  // Bei komplexen Tasks: Wähle das beste Modell (höchster Cost Multiplier)
  if (complexity === 'complex') {
    return candidates[candidates.length - 1].id;
  }

  // Bei standard Tasks: Wähle das mittlere Modell (oder das erste wenn nur 1-2 verfügbar)
  const middleIndex = Math.floor(candidates.length / 2);
  return candidates[middleIndex].id;
}

/**
 * Route einen Request zum optimalen Modell
 */
export interface RoutingResult {
  model: GitHubModel;
  complexity: TaskComplexity;
  config: ModelConfig;
  estimatedCost: number;
  reason: string;
}

export function routeRequest(
  messages: Message[],
  requirements?: {
    requiresTools?: boolean;
    preferredProvider?: 'openai' | 'anthropic' | 'google' | 'meta';
    maxCostMultiplier?: number;
    contextLength?: number;
    forceModel?: GitHubModel;
  }
): RoutingResult {
  // Wenn ein Modell erzwungen wird, verwende dieses
  if (requirements?.forceModel) {
    const config = MODEL_CONFIGS[requirements.forceModel];
    return {
      model: requirements.forceModel,
      complexity: config.recommendedFor[0] || 'standard',
      config,
      estimatedCost: 0, // Wird später berechnet
      reason: 'Modell durch Anforderung erzwungen',
    };
  }

  // Analysiere Komplexität
  const complexity = analyzeComplexity(messages);

  // Wähle optimales Modell
  const selectedModel = selectModel(complexity, requirements);
  const config = MODEL_CONFIGS[selectedModel];

  // Berechne geschätzte Kosten
  const estimatedTokens = Math.ceil(
    messages.map(m => m.content).join(' ').length / 4
  );
  const estimatedCost = (estimatedTokens / 1000) * config.costMultiplier * 0.002; // Grobe Schätzung

  // Generiere Begründung
  let reason = `Automatische Auswahl basierend auf Task-Komplexität "${complexity}"`;
  if (requirements?.preferredProvider) {
    reason += ` und Provider-Präferenz "${requirements.preferredProvider}"`;
  }
  if (requirements?.requiresTools) {
    reason += ' mit Tool-Support';
  }

  return {
    model: selectedModel,
    complexity,
    config,
    estimatedCost,
    reason,
  };
}

/**
 * Model Router Klasse für fortgeschrittenes Routing mit Caching
 */
export class ModelRouter {
  private config: RouterConfig;
  private routingCache: Map<string, RoutingResult> = new Map();
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  constructor(config?: Partial<RouterConfig>) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
  }

  /**
   * Route einen Request mit optionaler Caching
   */
  public route(
    messages: Message[],
    options?: {
      requirements?: Parameters<typeof routeRequest>[1];
      useCache?: boolean;
    }
  ): RoutingResult {
    const cacheKey = this.generateCacheKey(messages, options?.requirements);

    if (options?.useCache && this.routingCache.has(cacheKey)) {
      this.cacheHits++;
      return this.routingCache.get(cacheKey)!;
    }

    this.cacheMisses++;
    const result = routeRequest(messages, options?.requirements);

    if (options?.useCache) {
      this.routingCache.set(cacheKey, result);
      // Begrenze Cache-Größe
      if (this.routingCache.size > 1000) {
        const firstKey = this.routingCache.keys().next().value;
        if (firstKey) {
          this.routingCache.delete(firstKey);
        }
      }
    }

    return result;
  }

  /**
   * Generiert einen Cache-Key für einen Request
   */
  private generateCacheKey(
    messages: Message[],
    requirements?: Parameters<typeof routeRequest>[1]
  ): string {
    const content = messages.map(m => `${m.role}:${m.content}`).join('|');
    const reqHash = requirements
      ? JSON.stringify(requirements)
      : 'default';
    return `${this.hashString(content)}:${this.hashString(reqHash)}`;
  }

  /**
   * Einfacher String Hash
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Cache Statistiken
   */
  public getCacheStats(): { hits: number; misses: number; size: number; hitRate: number } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      size: this.routingCache.size,
      hitRate: total > 0 ? this.cacheHits / total : 0,
    };
  }

  /**
   * Leert den Cache
   */
  public clearCache(): void {
    this.routingCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Aktualisiert die Router-Konfiguration
   */
  public updateConfig(config: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...config };
    this.clearCache(); // Cache invalidieren bei Config-Änderung
  }

  /**
   * Gibt alle verfügbaren Modelle zurück
   */
  public getAvailableModels(): ModelConfig[] {
    return Object.values(MODEL_CONFIGS);
  }

  /**
   * Gibt Modelle gefiltert nach Komplexität zurück
   */
  public getModelsForComplexity(complexity: TaskComplexity): ModelConfig[] {
    return Object.values(MODEL_CONFIGS).filter(config =>
      config.recommendedFor.includes(complexity)
    );
  }
}

// Singleton Export
let globalRouter: ModelRouter | null = null;

export function initializeRouter(config?: Partial<RouterConfig>): ModelRouter {
  globalRouter = new ModelRouter(config);
  return globalRouter;
}

export function getRouter(): ModelRouter {
  if (!globalRouter) {
    return initializeRouter();
  }
  return globalRouter;
}

export { DEFAULT_ROUTER_CONFIG };
