/**
 * Starface Users API.
 */
import { StarfaceClient } from './client';
import { StarfaceUser } from './types';

export class StarfaceUsers {
  private _client: StarfaceClient;

  constructor(client: StarfaceClient) {
    this._client = client;
  }

  /**
   * Get all users.
   */
  public async getUsers(): Promise<StarfaceUser[]> {
    return this._client.get<StarfaceUser[]>('/users');
  }

  /**
   * Get a specific user by ID.
   */
  public async getUser(userId: string): Promise<StarfaceUser> {
    return this._client.get<StarfaceUser>(`/users/${encodeURIComponent(userId)}`);
  }

  /**
   * Find a user by login ID.
   */
  public async findByLogin(login: string): Promise<StarfaceUser | null> {
    const users = await this.getUsers();
    return users.find((u) => u.login === login) || null;
  }
}
