/**
 * Patient Matcher.
 * Fuzzy matching of caller information against known contacts/patients.
 * Uses phone number, name, and date of birth for matching.
 */
import { PatientCandidate } from './types';

/** Contact record for matching (from Starface or external source) */
export interface KnownContact {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  phoneNumbers: string[];
  dateOfBirth?: string;
}

export class PatientMatcher {
  private _contacts: KnownContact[] = [];

  /**
   * Load known contacts for matching.
   */
  public loadContacts(contacts: KnownContact[]): void {
    this._contacts = contacts;
  }

  /**
   * Find matching patients based on available information.
   */
  public match(query: {
    phoneNumber?: string;
    name?: string;
    dateOfBirth?: string;
  }): PatientCandidate[] {
    const candidates: PatientCandidate[] = [];

    for (const contact of this._contacts) {
      let score = 0;
      let method: PatientCandidate['matchMethod'] = 'fuzzy_name';

      // Phone number match (strongest signal)
      if (query.phoneNumber) {
        const normalizedQuery = this._normalizePhone(query.phoneNumber);
        const phoneMatch = contact.phoneNumbers.some(
          (p) => this._normalizePhone(p) === normalizedQuery
        );
        if (phoneMatch) {
          score += 0.6;
          method = 'exact_phone';
        }
      }

      // Name match
      if (query.name && (contact.firstName || contact.lastName || contact.displayName)) {
        const nameScore = this._fuzzyNameMatch(query.name, contact);
        if (nameScore > 0.3) {
          score += nameScore * 0.3;
          if (method === 'exact_phone') {
            method = 'phone_and_name';
          } else {
            method = 'fuzzy_name';
          }
        }
      }

      // Date of birth match
      if (query.dateOfBirth && contact.dateOfBirth) {
        if (this._normalizeDob(query.dateOfBirth) === this._normalizeDob(contact.dateOfBirth)) {
          score += 0.3;
          if (query.name && method === 'fuzzy_name') {
            method = 'name_and_dob';
          }
        }
      }

      if (score > 0.2) {
        candidates.push({
          name: contact.displayName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          dateOfBirth: contact.dateOfBirth,
          phoneNumber: contact.phoneNumbers[0],
          contactId: contact.id,
          matchScore: Math.min(1, score),
          matchMethod: method,
        });
      }
    }

    // Sort by score descending
    return candidates.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Normalize German phone number for comparison.
   */
  private _normalizePhone(phone: string): string {
    let normalized = phone.replace(/[\s\-()/]/g, '');
    // Convert +49 to 0
    if (normalized.startsWith('+49')) {
      normalized = '0' + normalized.substring(3);
    }
    if (normalized.startsWith('0049')) {
      normalized = '0' + normalized.substring(4);
    }
    return normalized;
  }

  /**
   * Fuzzy name matching using character-level similarity.
   * Handles German name variations (umlauts, common abbreviations).
   */
  private _fuzzyNameMatch(queryName: string, contact: KnownContact): number {
    const query = this._normalizeGermanName(queryName);
    const candidates: string[] = [];

    if (contact.displayName) candidates.push(this._normalizeGermanName(contact.displayName));
    if (contact.firstName) candidates.push(this._normalizeGermanName(contact.firstName));
    if (contact.lastName) candidates.push(this._normalizeGermanName(contact.lastName));
    if (contact.firstName && contact.lastName) {
      candidates.push(this._normalizeGermanName(`${contact.firstName} ${contact.lastName}`));
      candidates.push(this._normalizeGermanName(`${contact.lastName} ${contact.firstName}`));
    }

    let bestScore = 0;
    for (const candidate of candidates) {
      const score = this._levenshteinSimilarity(query, candidate);
      if (score > bestScore) bestScore = score;
    }

    return bestScore;
  }

  /**
   * Normalize German name for comparison.
   */
  private _normalizeGermanName(name: string): string {
    return name
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  }

  /**
   * Calculate Levenshtein-based similarity (0.0 – 1.0).
   */
  private _levenshteinSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (!a || !b) return 0.0;

    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;

    const distance = this._levenshteinDistance(a, b);
    return 1 - distance / maxLen;
  }

  private _levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // deletion
          dp[i][j - 1] + 1,      // insertion
          dp[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return dp[m][n];
  }

  /**
   * Normalize date of birth.
   */
  private _normalizeDob(dob: string): string {
    // Handle DD.MM.YYYY → YYYY-MM-DD
    const deMatch = dob.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (deMatch) {
      return `${deMatch[3]}-${deMatch[2].padStart(2, '0')}-${deMatch[1].padStart(2, '0')}`;
    }
    return dob;
  }
}
