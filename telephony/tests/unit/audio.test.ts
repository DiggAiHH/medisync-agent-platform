/**
 * Unit tests for audio module types and utilities.
 */
import * as assert from 'assert';
import { AudioFormat } from '../../src/audio/types';
import { getGermanWhisperConfig, GERMAN_MEDICAL_WHISPER_PROMPT, GERMAN_PHONE_PATTERNS } from '../../src/audio/germanConfig';
import { WhisperLocal } from '../../src/audio/whisperLocal';

describe('AudioFormat', () => {
  it('should have correct enum values', () => {
    assert.strictEqual(AudioFormat.WAV, 'wav');
    assert.strictEqual(AudioFormat.MP3, 'mp3');
    assert.strictEqual(AudioFormat.OGG, 'ogg');
    assert.strictEqual(AudioFormat.FLAC, 'flac');
  });
});

describe('germanConfig', () => {
  it('should return German language config', () => {
    const config = getGermanWhisperConfig();
    assert.strictEqual(config.language, 'de');
    assert.ok(config.initialPrompt.length > 0, 'Initial prompt should not be empty');
  });

  it('should include medical terms in whisper prompt', () => {
    assert.ok(GERMAN_MEDICAL_WHISPER_PROMPT.includes('Überweisung'));
    assert.ok(GERMAN_MEDICAL_WHISPER_PROMPT.includes('Rezept'));
    assert.ok(GERMAN_MEDICAL_WHISPER_PROMPT.includes('Blutdruck'));
    assert.ok(GERMAN_MEDICAL_WHISPER_PROMPT.includes('Versichertenkarte'));
  });

  it('should have phone patterns for all categories', () => {
    assert.ok(GERMAN_PHONE_PATTERNS.APPOINTMENT.length > 0);
    assert.ok(GERMAN_PHONE_PATTERNS.PRESCRIPTION.length > 0);
    assert.ok(GERMAN_PHONE_PATTERNS.REFERRAL.length > 0);
    assert.ok(GERMAN_PHONE_PATTERNS.RESULTS.length > 0);
    assert.ok(GERMAN_PHONE_PATTERNS.EMERGENCY.length > 0);
    assert.ok(GERMAN_PHONE_PATTERNS.SICK_NOTE.length > 0);
  });
});

describe('WhisperLocal.toTranscriptSegments()', () => {
  it('should convert Whisper segments to internal format', () => {
    const whisperSegments = [
      {
        id: 0,
        start: 0.0,
        end: 2.5,
        text: ' Guten Tag',
        tokens: [50365, 14414, 11204],
        temperature: 0.0,
        avg_logprob: -0.25,
        compression_ratio: 1.1,
        no_speech_prob: 0.01,
      },
      {
        id: 1,
        start: 2.5,
        end: 5.0,
        text: ' ich hätte gerne einen Termin',
        tokens: [50465, 958, 613],
        temperature: 0.0,
        avg_logprob: -0.3,
        compression_ratio: 1.2,
        no_speech_prob: 0.02,
      },
    ];

    const segments = WhisperLocal.toTranscriptSegments(whisperSegments);

    assert.strictEqual(segments.length, 2);

    // First segment
    assert.strictEqual(segments[0].startMs, 0);
    assert.strictEqual(segments[0].endMs, 2500);
    assert.strictEqual(segments[0].text, 'Guten Tag');
    assert.ok(segments[0].confidence >= 0 && segments[0].confidence <= 1);
    assert.strictEqual(segments[0].speaker, 'unknown');

    // Second segment
    assert.strictEqual(segments[1].startMs, 2500);
    assert.strictEqual(segments[1].endMs, 5000);
    assert.strictEqual(segments[1].text, 'ich hätte gerne einen Termin');
  });

  it('should clamp confidence between 0 and 1', () => {
    const segments = WhisperLocal.toTranscriptSegments([
      {
        id: 0,
        start: 0,
        end: 1,
        text: 'test',
        tokens: [],
        temperature: 0,
        avg_logprob: -10, // Very poor → exp(-10) ≈ 0.00005
        compression_ratio: 1,
        no_speech_prob: 0,
      },
    ]);

    assert.ok(segments[0].confidence >= 0);
    assert.ok(segments[0].confidence <= 1);
  });
});
