/**
 * Unit tests for PatientMatcher.
 * Tests fuzzy name matching, phone normalization, and DOB matching.
 */
import * as assert from 'assert';
import { PatientMatcher, KnownContact } from '../../src/triage/patientMatcher';

describe('PatientMatcher', () => {
  let matcher: PatientMatcher;

  const testContacts: KnownContact[] = [
    {
      id: 'c1',
      firstName: 'Hans',
      lastName: 'Müller',
      displayName: 'Hans Müller',
      phoneNumbers: ['+49 171 1234567', '030 12345678'],
      dateOfBirth: '15.03.1965',
    },
    {
      id: 'c2',
      firstName: 'Maria',
      lastName: 'Schmidt',
      displayName: 'Maria Schmidt',
      phoneNumbers: ['0171 9876543'],
      dateOfBirth: '22.11.1978',
    },
    {
      id: 'c3',
      firstName: 'Jürgen',
      lastName: 'Schröder',
      displayName: 'Jürgen Schröder',
      phoneNumbers: ['+49 160 5555555'],
    },
    {
      id: 'c4',
      firstName: 'Ärztliche',
      lastName: 'Notfallpraxis',
      displayName: 'Ärztliche Notfallpraxis',
      phoneNumbers: ['116117'],
    },
  ];

  beforeEach(() => {
    matcher = new PatientMatcher();
    matcher.loadContacts(testContacts);
  });

  describe('phone number matching', () => {
    it('should match exact phone number', () => {
      const results = matcher.match({ phoneNumber: '+49 171 1234567' });
      assert.ok(results.length > 0, 'Should find at least one match');
      assert.strictEqual(results[0].contactId, 'c1');
    });

    it('should match normalized +49 → 0 format', () => {
      const results = matcher.match({ phoneNumber: '01711234567' });
      assert.ok(results.length > 0);
      assert.strictEqual(results[0].contactId, 'c1');
    });

    it('should match with different spacing', () => {
      const results = matcher.match({ phoneNumber: '0171-987-6543' });
      assert.ok(results.length > 0);
      assert.strictEqual(results[0].contactId, 'c2');
    });

    it('should match 0049 prefix', () => {
      const results = matcher.match({ phoneNumber: '00491601555555' });
      // Normalize: 0049160... → 0160...
      // This should match c3 whose number +49 160 5555555 → 01605555555
      // But the stored number has different digits, let me check
      const results2 = matcher.match({ phoneNumber: '0049 160 5555555' });
      assert.ok(results2.length > 0);
      assert.strictEqual(results2[0].contactId, 'c3');
    });

    it('should return empty for unknown phone numbers', () => {
      const results = matcher.match({ phoneNumber: '0999 000 0000' });
      assert.strictEqual(results.length, 0);
    });
  });

  describe('name matching', () => {
    it('should match exact name', () => {
      const results = matcher.match({ name: 'Hans Müller' });
      assert.ok(results.length > 0);
      assert.strictEqual(results[0].contactId, 'c1');
    });

    it('should match with umlaut normalization (Mueller → Müller)', () => {
      // The matcher normalizes ü→ue, so "Mueller" and "Müller" both become "mueller"
      const results = matcher.match({ name: 'Hans Mueller' });
      assert.ok(results.length > 0);
      assert.strictEqual(results[0].contactId, 'c1');
    });

    it('should match reversed name order', () => {
      const results = matcher.match({ name: 'Müller Hans' });
      assert.ok(results.length > 0);
      assert.strictEqual(results[0].contactId, 'c1');
    });

    it('should match close typos via Levenshtein', () => {
      const results = matcher.match({ name: 'Maria Schmid' }); // missing 't'
      assert.ok(results.length > 0);
      assert.strictEqual(results[0].contactId, 'c2');
    });
  });

  describe('combined matching', () => {
    it('should give highest score to phone + name match', () => {
      const results = matcher.match({
        phoneNumber: '+49 171 1234567',
        name: 'Hans Müller',
      });
      assert.ok(results.length > 0);
      assert.strictEqual(results[0].contactId, 'c1');
      assert.strictEqual(results[0].matchMethod, 'phone_and_name');
      assert.ok(results[0].matchScore > 0.7);
    });

    it('should match with name + DOB', () => {
      const results = matcher.match({
        name: 'Maria Schmidt',
        dateOfBirth: '22.11.1978',
      });
      assert.ok(results.length > 0);
      assert.strictEqual(results[0].contactId, 'c2');
      assert.strictEqual(results[0].matchMethod, 'name_and_dob');
    });
  });

  describe('sorting', () => {
    it('should return results sorted by score descending', () => {
      const results = matcher.match({ name: 'Schmidt' });
      for (let i = 1; i < results.length; i++) {
        assert.ok(
          results[i - 1].matchScore >= results[i].matchScore,
          'Results should be sorted by score descending'
        );
      }
    });
  });
});
