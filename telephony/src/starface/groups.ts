/**
 * Starface Groups API.
 */
import { StarfaceClient } from './client';
import { StarfaceGroup } from './types';

export class StarfaceGroups {
  private _client: StarfaceClient;

  constructor(client: StarfaceClient) {
    this._client = client;
  }

  /**
   * Get all groups.
   */
  public async getGroups(): Promise<StarfaceGroup[]> {
    return this._client.get<StarfaceGroup[]>('/groups');
  }

  /**
   * Get a specific group by ID.
   */
  public async getGroup(groupId: string): Promise<StarfaceGroup> {
    return this._client.get<StarfaceGroup>(`/groups/${encodeURIComponent(groupId)}`);
  }

  /**
   * Find groups that a user belongs to.
   */
  public async getGroupsForUser(userId: string): Promise<StarfaceGroup[]> {
    const groups = await this.getGroups();
    return groups.filter((g) => g.memberIds.includes(userId));
  }
}
