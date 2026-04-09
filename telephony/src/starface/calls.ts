/**
 * Starface Call Services API.
 * List active calls, initiate calls, hangup, transfer.
 */
import { StarfaceClient } from './client';
import { StarfaceCallEntry } from './types';

export class StarfaceCalls {
  private _client: StarfaceClient;

  constructor(client: StarfaceClient) {
    this._client = client;
  }

  /**
   * Get all currently active calls.
   */
  public async getActiveCalls(): Promise<StarfaceCallEntry[]> {
    return this._client.get<StarfaceCallEntry[]>('/calls');
  }

  /**
   * Get a specific call by ID.
   */
  public async getCall(callId: string): Promise<StarfaceCallEntry> {
    return this._client.get<StarfaceCallEntry>(`/calls/${encodeURIComponent(callId)}`);
  }

  /**
   * Initiate a new outbound call.
   * @param fromUserId - Starface user initiating the call
   * @param toNumber - Destination phone number
   */
  public async initiateCall(fromUserId: string, toNumber: string): Promise<StarfaceCallEntry> {
    return this._client.post<StarfaceCallEntry>('/calls', {
      userId: fromUserId,
      number: toNumber,
    });
  }

  /**
   * Hang up / terminate a call.
   */
  public async hangup(callId: string): Promise<void> {
    await this._client.delete<void>(`/calls/${encodeURIComponent(callId)}`);
  }

  /**
   * Poll for call state changes.
   * Compares current active calls with previous snapshot to detect new/ended calls.
   */
  public detectChanges(
    previousCalls: Map<string, StarfaceCallEntry>,
    currentCalls?: StarfaceCallEntry[]
  ): {
    newCalls: StarfaceCallEntry[];
    endedCalls: StarfaceCallEntry[];
    changedCalls: StarfaceCallEntry[];
  } {
    const currentMap = new Map<string, StarfaceCallEntry>(
      (currentCalls || []).map((c) => [c.id, c])
    );

    const newCalls: StarfaceCallEntry[] = [];
    const endedCalls: StarfaceCallEntry[] = [];
    const changedCalls: StarfaceCallEntry[] = [];

    // Detect new and changed calls
    for (const [id, call] of currentMap) {
      const prev = previousCalls.get(id);
      if (!prev) {
        newCalls.push(call);
      } else if (prev.state !== call.state) {
        changedCalls.push(call);
      }
    }

    // Detect ended calls (in previous but not in current)
    for (const [id, call] of previousCalls) {
      if (!currentMap.has(id)) {
        endedCalls.push(call);
      }
    }

    return { newCalls, endedCalls, changedCalls };
  }
}
