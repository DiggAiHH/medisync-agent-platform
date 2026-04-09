/**
 * Privacy Filter.
 * Redacts PII (Personally Identifiable Information) from log output.
 * Ensures medical data never appears in plain logs.
 */

/** Common German PII patterns */
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // German phone numbers: +49, 0049, or local formats
  { pattern: /(\+49|0049|0)\s*[\d\s\-/]{6,14}/g, replacement: '[TELEFON]' },
  // Email addresses
  { pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replacement: '[EMAIL]' },
  // Date of birth patterns (DD.MM.YYYY, DD/MM/YYYY)
  { pattern: /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g, replacement: '[DATUM]' },
  // German health insurance number (Versichertennummer) — 1 letter + 9 digits
  { pattern: /\b[A-Z]\d{9}\b/g, replacement: '[VERSICHERTENNR]' },
  // Social security / Sozialversicherungsnummer — 2 digits + date + letter + 3 digits
  { pattern: /\b\d{2}\s?\d{6}\s?[A-Z]\s?\d{3}\b/g, replacement: '[SVNR]' },
  // IBAN
  { pattern: /\b[A-Z]{2}\d{2}\s?[\d\s]{10,30}\b/g, replacement: '[IBAN]' },
  // IP addresses
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[IP]' },
  // ICD-10 codes (keep these — they're medical codes, not PII per se, but filter from logs)
  { pattern: /\b[A-Z]\d{2}(\.\d{1,2})?\b/g, replacement: '[ICD10]' },
];

/** Name patterns — heuristic, not perfect */
const NAME_INDICATORS = [
  /(?:[Hh]err|[Ff]rau|[Pp]atient(?:in)?|[Nn]ame)\s*:?\s*([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+){0,3})/g,
];

export class PrivacyFilter {
  private _customPatterns: Array<{ pattern: RegExp; replacement: string }> = [];

  /**
   * Add a custom PII pattern.
   */
  public addPattern(pattern: RegExp, replacement: string): void {
    this._customPatterns.push({ pattern, replacement });
  }

  /**
   * Redact PII from a string.
   * Returns the redacted string.
   */
  public redact(text: string): string {
    let result = text;

    // Apply name patterns first
    for (const namePattern of NAME_INDICATORS) {
      result = result.replace(namePattern, (match) => {
        // Keep the prefix (Herr, Frau, etc.) but redact the name
        const colonIndex = match.indexOf(':');
        if (colonIndex >= 0) {
          return match.substring(0, colonIndex + 1) + ' [NAME]';
        }
        const spaceIndex = match.indexOf(' ');
        if (spaceIndex >= 0) {
          return match.substring(0, spaceIndex) + ' [NAME]';
        }
        return '[NAME]';
      });
    }

    // Apply standard PII patterns
    for (const { pattern, replacement } of [...PII_PATTERNS, ...this._customPatterns]) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      result = result.replace(pattern, replacement);
    }

    return result;
  }

  /**
   * Redact PII from all string values in an object.
   * Returns a new object with redacted strings.
   */
  public redactObject<T extends Record<string, unknown>>(obj: T): T {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.redact(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.redactObject(value as Record<string, unknown>);
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === 'string'
            ? this.redact(item)
            : typeof item === 'object' && item !== null
              ? this.redactObject(item as Record<string, unknown>)
              : item
        );
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }

  /**
   * Check if a string likely contains PII.
   */
  public containsPII(text: string): boolean {
    for (const { pattern } of [...PII_PATTERNS, ...this._customPatterns]) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        return true;
      }
    }
    for (const namePattern of NAME_INDICATORS) {
      namePattern.lastIndex = 0;
      if (namePattern.test(text)) {
        return true;
      }
    }
    return false;
  }
}
