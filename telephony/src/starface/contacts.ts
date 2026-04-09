/**
 * Starface Contacts API.
 * Lookup contacts by phone number for caller identification.
 */
import { StarfaceClient } from './client';
import { StarfaceContact } from './types';

export class StarfaceContacts {
  private _client: StarfaceClient;
  /** Simple caller ID cache: phone → contact */
  private _callerCache: Map<string, StarfaceContact | null> = new Map();

  constructor(client: StarfaceClient) {
    this._client = client;
  }

  /**
   * Get all contacts.
   */
  public async getContacts(): Promise<StarfaceContact[]> {
    return this._client.get<StarfaceContact[]>('/contacts');
  }

  /**
   * Get a contact by ID.
   */
  public async getContact(contactId: string): Promise<StarfaceContact> {
    return this._client.get<StarfaceContact>(`/contacts/${encodeURIComponent(contactId)}`);
  }

  /**
   * Search contacts by phone number.
   * Returns the first matching contact or null.
   */
  public async findByPhoneNumber(phoneNumber: string): Promise<StarfaceContact | null> {
    const normalized = this._normalizePhone(phoneNumber);

    // Check cache first
    if (this._callerCache.has(normalized)) {
      return this._callerCache.get(normalized) || null;
    }

    try {
      const contacts = await this.getContacts();
      for (const contact of contacts) {
        for (const phone of contact.phoneNumbers) {
          if (this._normalizePhone(phone.number) === normalized) {
            this._callerCache.set(normalized, contact);
            return contact;
          }
        }
      }
    } catch (error) {
      console.error('[StarfaceContacts] Error searching contacts:', error instanceof Error ? error.message : error);
    }

    this._callerCache.set(normalized, null);
    return null;
  }

  /**
   * Create a new contact.
   */
  public async createContact(contact: Omit<StarfaceContact, 'id'>): Promise<StarfaceContact> {
    const result = await this._client.post<StarfaceContact>('/contacts', contact);
    // Invalidate cache
    for (const phone of contact.phoneNumbers) {
      this._callerCache.delete(this._normalizePhone(phone.number));
    }
    return result;
  }

  /**
   * Clear the caller ID cache.
   */
  public clearCache(): void {
    this._callerCache.clear();
  }

  /**
   * Normalize phone number for comparison.
   * Strips spaces, dashes, leading +49/0049, and normalizes to digits only.
   */
  private _normalizePhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-/()]/g, '');
    // Convert +49 or 0049 to 0
    if (cleaned.startsWith('+49')) {
      cleaned = '0' + cleaned.substring(3);
    } else if (cleaned.startsWith('0049')) {
      cleaned = '0' + cleaned.substring(4);
    }
    return cleaned;
  }
}
