import * as assert from 'assert';

/**
 * Tests für Apply-to-Editor Handler
 */

// Mock Editor
interface MockEditor {
    document: { uri: { toString: () => string } };
    selection: { active: { line: number; character: number } };
    edit: (callback: (editBuilder: MockEditBuilder) => void, options?: any) => Promise<boolean>;
}

interface MockEditBuilder {
    insert: (position: any, text: string) => void;
}

class MockVSCode {
    public static activeTextEditor: MockEditor | null = null;
    public static lastMessage: string | null = null;
    
    static window = {
        activeTextEditor: null as MockEditor | null,
        showInformationMessage: (msg: string) => { this.lastMessage = msg; },
        showWarningMessage: (msg: string) => { this.lastMessage = msg; }
    };
}

// Apply Handler Logik
async function handleApplyResult(
    editor: MockEditor | null,
    text: string
): Promise<{ success: boolean; error?: string }> {
    if (!editor) {
        return { success: false, error: 'Kein aktiver Editor' };
    }
    
    try {
        await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, text);
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: String(error) };
    }
}

suite('Apply-to-Editor Test Suite', () => {
    
    test('should insert text at cursor position', async () => {
        let insertedText = '';
        let insertPosition: any = null;
        
        const mockEditor: MockEditor = {
            document: { uri: { toString: () => 'file:///test.md' } },
            selection: { active: { line: 5, character: 10 } },
            edit: async (callback) => {
                const builder: MockEditBuilder = {
                    insert: (pos, text) => {
                        insertPosition = pos;
                        insertedText = text;
                    }
                };
                callback(builder);
                return true;
            }
        };
        
        const result = await handleApplyResult(mockEditor, 'Testtext');
        
        assert.strictEqual(result.success, true);
        assert.strictEqual(insertedText, 'Testtext');
        assert.deepStrictEqual(insertPosition, { line: 5, character: 10 });
    });
    
    test('should return error when no editor active', async () => {
        const result = await handleApplyResult(null, 'Test');
        
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Kein aktiver Editor'));
    });
    
    test('should handle editor edit error', async () => {
        const mockEditor: MockEditor = {
            document: { uri: { toString: () => 'file:///test.md' } },
            selection: { active: { line: 0, character: 0 } },
            edit: async () => {
                throw new Error('Edit failed');
            }
        };
        
        const result = await handleApplyResult(mockEditor, 'Test');
        
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Edit failed'));
    });
});
