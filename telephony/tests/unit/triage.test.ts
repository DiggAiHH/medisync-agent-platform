/**
 * Unit tests for JSON validator / parser utilities used in triage.
 * Tests the JSON extraction helpers shared across triage modules.
 */
import * as assert from 'assert';
import { UrgencyClassifier } from '../../src/triage/urgencyClassifier';
import { IntentExtractor } from '../../src/triage/intentExtractor';
import { EmpathyAnalyzer } from '../../src/triage/empathyAnalyzer';
import { UrgencyLevel, CallIntent } from '../../src/shared/types';

const OLLAMA_CONFIG = {
  // Intentionally unreachable endpoint to force deterministic fallback behavior.
  endpoint: 'http://127.0.0.1:1',
  model: 'llama3.2',
  temperature: 0.2,
  maxTokens: 2000,
  requestTimeoutMs: 300,
};

describe('UrgencyClassifier', () => {
  describe('rule-based fallback', () => {
    let classifier: UrgencyClassifier;

    beforeEach(() => {
      classifier = new UrgencyClassifier(OLLAMA_CONFIG);
    });

    it('should detect Notfall keywords', async () => {
      // classify() calls LLM first, which fails without Ollama → falls back to rules
      const result = await classifier.classify(
        'Patient hat starke Brustschmerzen und Atemnot seit einer Stunde'
      );
      assert.strictEqual(result.level, UrgencyLevel.NOTFALL);
      assert.ok(result.confidence > 0);
      assert.ok(result.urgencyCues.length > 0);
    });

    it('should detect Dringend keywords', async () => {
      const result = await classifier.classify(
        'Ich habe seit drei Tagen hohes Fieber und es wird schlimmer geworden'
      );
      assert.strictEqual(result.level, UrgencyLevel.DRINGEND);
    });

    it('should default to Normal when no urgency cues', async () => {
      const result = await classifier.classify(
        'Ich möchte gerne einen Kontrolltermin vereinbaren'
      );
      assert.strictEqual(result.level, UrgencyLevel.NORMAL);
    });
  });
});

describe('IntentExtractor', () => {
  describe('rule-based fallback', () => {
    let extractor: IntentExtractor;

    beforeEach(() => {
      extractor = new IntentExtractor(OLLAMA_CONFIG);
    });

    it('should detect Termin intent', async () => {
      const result = await extractor.extract(
        'Guten Tag, ich hätte gerne einen Termin bei Doktor Müller nächste Woche'
      );
      assert.strictEqual(result.primaryIntent, CallIntent.TERMIN);
    });

    it('should detect Rezept intent', async () => {
      const result = await extractor.extract(
        'Ich brauche ein Folgerezept für Metformin'
      );
      assert.strictEqual(result.primaryIntent, CallIntent.REZEPT);
    });

    it('should detect Überweisung intent', async () => {
      const result = await extractor.extract(
        'Mein Hausarzt hat gesagt ich brauche eine Überweisung zum Facharzt'
      );
      assert.strictEqual(result.primaryIntent, CallIntent.UEBERWEISUNG);
    });

    it('should detect Befund intent', async () => {
      const result = await extractor.extract(
        'Ich rufe an wegen meiner Laborwerte vom letzten Blutbild'
      );
      assert.strictEqual(result.primaryIntent, CallIntent.BEFUND);
    });

    it('should detect Notfall intent', async () => {
      const result = await extractor.extract(
        'Bitte sofort helfen! Notfall! Patient ist bewusstlos!'
      );
      assert.strictEqual(result.primaryIntent, CallIntent.NOTFALL);
    });

    it('should return Sonstiges for unclear intents', async () => {
      const result = await extractor.extract('Hallo, wie geht es Ihnen?');
      assert.strictEqual(result.primaryIntent, CallIntent.SONSTIGES);
    });
  });
});

describe('EmpathyAnalyzer', () => {
  describe('rule-based fallback', () => {
    let analyzer: EmpathyAnalyzer;

    beforeEach(() => {
      analyzer = new EmpathyAnalyzer(OLLAMA_CONFIG);
    });

    it('should detect distressed callers', async () => {
      const result = await analyzer.analyze(
        'Bitte helfen Sie mir, ich habe starke Schmerzen und große Angst'
      );
      assert.ok(
        result.overallSentiment === 'distressed' || result.overallSentiment === 'concerned',
        `Expected distressed/concerned but got ${result.overallSentiment}`
      );
      assert.ok(result.distressLevel > 0.3);
    });

    it('should detect angry callers', async () => {
      const result = await analyzer.analyze(
        'Das ist unverschämt, ich warte hier seit einer Stunde und bin sehr unzufrieden'
      );
      assert.strictEqual(result.overallSentiment, 'angry');
      assert.strictEqual(result.recommendedTone, 'calm');
    });

    it('should default to neutral for calm callers', async () => {
      const result = await analyzer.analyze(
        'Guten Tag, ich rufe an wegen eines Termins. Vielen Dank.'
      );
      assert.strictEqual(result.overallSentiment, 'neutral');
    });
  });
});
