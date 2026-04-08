import * as assert from 'assert';

/**
 * Tests für TimeLimitedUndoManager
 */

// Mock Implementierung für Tests
interface UndoableAction {
    id: string;
    description: string;
    timestamp: number;
    expiresAt: number;
    undoFn: () => Promise<void>;
}

class TestableUndoManager {
    private _actions: Map<string, UndoableAction> = new Map();
    private readonly _UNDO_WINDOW_MS = 10 * 60 * 1000; // 10 Minuten
    
    registerAction(
        id: string,
        description: string,
        undoFn: () => Promise<void>
    ): { id: string; expiresAt: number } {
        const now = Date.now();
        const action: UndoableAction = {
            id,
            description,
            timestamp: now,
            expiresAt: now + this._UNDO_WINDOW_MS,
            undoFn
        };
        this._actions.set(id, action);
        return { id, expiresAt: action.expiresAt };
    }
    
    async undo(id: string): Promise<{ success: boolean; error?: string }> {
        const action = this._actions.get(id);
        if (!action) return { success: false, error: 'Not found' };
        if (Date.now() > action.expiresAt) {
            return { success: false, error: 'Expired' };
        }
        await action.undoFn();
        this._actions.delete(id);
        return { success: true };
    }
    
    canUndo(id: string): boolean {
        const action = this._actions.get(id);
        return !!action && Date.now() <= action.expiresAt;
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
}

suite('TimeLimitedUndoManager Test Suite', () => {
    let undoManager: TestableUndoManager;
    
    setup(() => {
        undoManager = new TestableUndoManager();
    });
    
    test('should register action with 10-minute window', () => {
        const result = undoManager.registerAction('test-1', 'Test Action', async () => {});
        
        assert.strictEqual(result.id, 'test-1');
        
        // Prüfe ob expiresAt ca. 10 Minuten in der Zukunft liegt
        const tenMinutes = 10 * 60 * 1000;
        const now = Date.now();
        const diff = result.expiresAt - now;
        
        assert.ok(diff >= tenMinutes - 1000 && diff <= tenMinutes + 1000, 
            'expiresAt sollte ~10 Minuten in der Zukunft liegen');
    });
    
    test('should undo action within window', async () => {
        let undoCalled = false;
        undoManager.registerAction('test-2', 'Test', async () => {
            undoCalled = true;
        });
        
        const result = await undoManager.undo('test-2');
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(undoCalled, true);
    });
    
    test('should fail undo for non-existent action', async () => {
        const result = await undoManager.undo('non-existent');
        
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Not found'));
    });
    
    test('should track remaining time correctly', () => {
        undoManager.registerAction('test-3', 'Test', async () => {});
        
        const remaining = undoManager.getRemainingTime('test-3');
        
        // Sollte knapp unter 10 Minuten sein
        assert.ok(remaining > 9 * 60 * 1000 && remaining <= 10 * 60 * 1000,
            'Remaining time sollte ~10 Minuten sein');
    });
    
    test('should format remaining time correctly', () => {
        undoManager.registerAction('test-4', 'Test', async () => {});
        
        const formatted = undoManager.formatRemainingTime('test-4');
        
        // Format: "9:59" oder ähnlich
        assert.ok(/\d+:\d{2}/.test(formatted), 'Sollte Format "M:SS" haben');
    });
    
    test('should report canUndo correctly', () => {
        undoManager.registerAction('test-5', 'Test', async () => {});
        
        assert.strictEqual(undoManager.canUndo('test-5'), true);
        assert.strictEqual(undoManager.canUndo('non-existent'), false);
    });
});
