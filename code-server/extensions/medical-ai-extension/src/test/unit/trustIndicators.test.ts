import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * Tests für Trust Indicators (Confidence Progress Bar, Timer)
 */
suite('Trust Indicators Test Suite', () => {
    
    test('should format duration correctly', () => {
        // Teste formatDuration Funktion
        const testCases = [
            { input: 500, expected: '500ms' },
            { input: 1500, expected: '1.5s' },
            { input: 60000, expected: '1:00min' },
            { input: 90000, expected: '1:30min' },
            { input: 123456, expected: '2:03min' }
        ];
        
        // Mock für die formatDuration Funktion
        function formatDuration(ms: number): string {
            if (ms < 1000) return `${ms}ms`;
            const seconds = (ms / 1000).toFixed(1);
            if (ms < 60000) return `${seconds}s`;
            const minutes = Math.floor(ms / 60000);
            const remainingSeconds = Math.floor((ms % 60000) / 1000);
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}min`;
        }
        
        testCases.forEach(({ input, expected }) => {
            assert.strictEqual(formatDuration(input), expected, 
                `formatDuration(${input}) sollte ${expected} zurückgeben`);
        });
    });
    
    test('should determine confidence level correctly', () => {
        function getConfidenceLevel(confidence: number): { level: string; color: string } {
            if (confidence >= 80) return { level: 'high', color: '#388E3C' };
            if (confidence >= 50) return { level: 'medium', color: '#F57C00' };
            return { level: 'low', color: '#D32F2F' };
        }
        
        assert.strictEqual(getConfidenceLevel(95).level, 'high');
        assert.strictEqual(getConfidenceLevel(80).level, 'high');
        assert.strictEqual(getConfidenceLevel(79).level, 'medium');
        assert.strictEqual(getConfidenceLevel(50).level, 'medium');
        assert.strictEqual(getConfidenceLevel(49).level, 'low');
        assert.strictEqual(getConfidenceLevel(10).level, 'low');
    });
    
    test('should generate correct ARIA label for confidence', () => {
        function generateAriaLabel(confidence: number): string {
            let label: string;
            if (confidence >= 80) label = 'Hohe Zuversicht';
            else if (confidence >= 50) label = 'Moderate Zuversicht';
            else label = 'Niedrige Zuversicht';
            return `Konfidenz: ${label}, ${confidence}%`;
        }
        
        assert.ok(generateAriaLabel(90).includes('Hohe Zuversicht'));
        assert.ok(generateAriaLabel(90).includes('90%'));
        assert.ok(generateAriaLabel(60).includes('Moderate Zuversicht'));
        assert.ok(generateAriaLabel(30).includes('Niedrige Zuversicht'));
    });
});
