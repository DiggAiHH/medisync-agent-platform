/**
 * Unit tests for German medical triage prompts.
 */
import * as assert from 'assert';
import {
  URGENCY_SYSTEM_PROMPT,
  INTENT_SYSTEM_PROMPT,
  EMPATHY_SYSTEM_PROMPT,
  PREDOC_SYSTEM_PROMPT,
  buildUrgencyPrompt,
  buildIntentPrompt,
  buildEmpathyPrompt,
  buildPreDocPrompt,
} from '../../src/triage/prompts';

describe('Triage Prompts', () => {
  describe('system prompts', () => {
    it('should be in German', () => {
      assert.ok(URGENCY_SYSTEM_PROMPT.includes('Dringlichkeit'));
      assert.ok(INTENT_SYSTEM_PROMPT.includes('Absicht'));
      assert.ok(EMPATHY_SYSTEM_PROMPT.includes('emotionale'));
      assert.ok(PREDOC_SYSTEM_PROMPT.includes('Vordokumentation'));
    });

    it('should request JSON format', () => {
      assert.ok(URGENCY_SYSTEM_PROMPT.includes('JSON'));
      assert.ok(INTENT_SYSTEM_PROMPT.includes('JSON'));
      assert.ok(EMPATHY_SYSTEM_PROMPT.includes('JSON'));
      assert.ok(PREDOC_SYSTEM_PROMPT.includes('JSON'));
    });

    it('should include all urgency levels', () => {
      assert.ok(URGENCY_SYSTEM_PROMPT.includes('"notfall"'));
      assert.ok(URGENCY_SYSTEM_PROMPT.includes('"dringend"'));
      assert.ok(URGENCY_SYSTEM_PROMPT.includes('"normal"'));
      assert.ok(URGENCY_SYSTEM_PROMPT.includes('"information"'));
    });

    it('should include all intent types', () => {
      assert.ok(INTENT_SYSTEM_PROMPT.includes('"termin"'));
      assert.ok(INTENT_SYSTEM_PROMPT.includes('"rezept"'));
      assert.ok(INTENT_SYSTEM_PROMPT.includes('"ueberweisung"'));
      assert.ok(INTENT_SYSTEM_PROMPT.includes('"befund"'));
      assert.ok(INTENT_SYSTEM_PROMPT.includes('"notfall"'));
    });
  });

  describe('prompt builders', () => {
    it('should embed transcript text in urgency prompt', () => {
      const transcript = 'Patient: Ich habe starke Brustschmerzen.';
      const prompt = buildUrgencyPrompt(transcript);
      assert.ok(prompt.includes(transcript));
      assert.ok(prompt.includes('Transkript'));
    });

    it('should embed transcript text in intent prompt', () => {
      const transcript = 'Ich brauche ein Rezept für Ibuprofen.';
      const prompt = buildIntentPrompt(transcript);
      assert.ok(prompt.includes(transcript));
    });

    it('should embed transcript text in empathy prompt', () => {
      const transcript = 'Ich habe große Angst.';
      const prompt = buildEmpathyPrompt(transcript);
      assert.ok(prompt.includes(transcript));
    });

    it('should embed transcript, urgency, and intent in pre-doc prompt', () => {
      const transcript = 'Patient klagt über Kopfschmerzen.';
      const prompt = buildPreDocPrompt(transcript, 'normal', 'beratung');
      assert.ok(prompt.includes(transcript));
      assert.ok(prompt.includes('normal'));
      assert.ok(prompt.includes('beratung'));
    });
  });
});
