import * as assert from 'assert';

/**
 * Tests für Model Selector
 */

// Mock für VS Code Configuration
class MockConfig {
    private _values: Map<string, any> = new Map();
    
    get<T>(key: string): T | undefined {
        return this._values.get(key);
    }
    
    async update(key: string, value: any, global?: boolean): Promise<void> {
        this._values.set(key, value);
    }
}

// Mock Ollama Service
class MockOllamaService {
    private _currentModel: string = 'llama3.2';
    private _config: MockConfig;
    private _availableModels: string[] = ['llama3.2', 'mistral', 'codellama'];
    
    constructor(config: MockConfig) {
        this._config = config;
        const saved = config.get<string>('modelName');
        if (saved) this._currentModel = saved;
    }
    
    async setModel(modelName: string): Promise<boolean> {
        if (!this._availableModels.includes(modelName)) {
            return false;
        }
        this._currentModel = modelName;
        await this._config.update('modelName', modelName, true);
        return true;
    }
    
    getCurrentModel(): string {
        return this._currentModel;
    }
    
    async listModels(): Promise<{ name: string }[]> {
        return this._availableModels.map(m => ({ name: m }));
    }
}

suite('Model Selector Test Suite', () => {
    let config: MockConfig;
    let service: MockOllamaService;
    
    setup(() => {
        config = new MockConfig();
        service = new MockOllamaService(config);
    });
    
    test('should load default model on init', () => {
        assert.strictEqual(service.getCurrentModel(), 'llama3.2');
    });
    
    test('should load saved model from config', () => {
        config.update('modelName', 'mistral');
        const newService = new MockOllamaService(config);
        
        assert.strictEqual(newService.getCurrentModel(), 'mistral');
    });
    
    test('should change model successfully', async () => {
        const result = await service.setModel('codellama');
        
        assert.strictEqual(result, true);
        assert.strictEqual(service.getCurrentModel(), 'codellama');
        assert.strictEqual(config.get('modelName'), 'codellama');
    });
    
    test('should fail to change to non-existent model', async () => {
        const result = await service.setModel('non-existent-model');
        
        assert.strictEqual(result, false);
        // Sollte bei altem Modell bleiben
        assert.strictEqual(service.getCurrentModel(), 'llama3.2');
    });
    
    test('should persist model change to config', async () => {
        await service.setModel('mistral');
        
        const savedModel = config.get<string>('modelName');
        assert.strictEqual(savedModel, 'mistral');
    });
    
    test('should list available models', async () => {
        const models = await service.listModels();
        
        assert.strictEqual(models.length, 3);
        assert.ok(models.some(m => m.name === 'llama3.2'));
        assert.ok(models.some(m => m.name === 'mistral'));
    });
});
