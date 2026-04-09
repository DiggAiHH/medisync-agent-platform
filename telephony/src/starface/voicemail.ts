/**
 * Starface Voicemail API.
 * Access voicemail boxes and download audio messages.
 */
import { StarfaceClient } from './client';
import { StarfaceVoicemailBox, StarfaceVoicemailMessage } from './types';

export class StarfaceVoicemail {
  private _client: StarfaceClient;

  constructor(client: StarfaceClient) {
    this._client = client;
  }

  /**
   * Get all voicemail boxes.
   */
  public async getBoxes(): Promise<StarfaceVoicemailBox[]> {
    return this._client.get<StarfaceVoicemailBox[]>('/voicemailboxes');
  }

  /**
   * Get a specific voicemail box.
   */
  public async getBox(boxId: string): Promise<StarfaceVoicemailBox> {
    return this._client.get<StarfaceVoicemailBox>(`/voicemailboxes/${encodeURIComponent(boxId)}`);
  }

  /**
   * Get all messages in a voicemail box.
   */
  public async getMessages(boxId: string): Promise<StarfaceVoicemailMessage[]> {
    return this._client.get<StarfaceVoicemailMessage[]>(
      `/voicemailboxes/${encodeURIComponent(boxId)}/messages`
    );
  }

  /**
   * Get new (unheard) messages in a voicemail box.
   */
  public async getNewMessages(boxId: string): Promise<StarfaceVoicemailMessage[]> {
    const messages = await this.getMessages(boxId);
    return messages.filter((m) => m.isNew);
  }

  /**
   * Download voicemail audio as WAV buffer.
   */
  public async downloadAudio(boxId: string, messageId: string): Promise<Buffer> {
    return this._client.downloadBinary(
      `/voicemailboxes/${encodeURIComponent(boxId)}/messages/${encodeURIComponent(messageId)}/audio`
    );
  }

  /**
   * Delete a voicemail message.
   */
  public async deleteMessage(boxId: string, messageId: string): Promise<void> {
    await this._client.delete<void>(
      `/voicemailboxes/${encodeURIComponent(boxId)}/messages/${encodeURIComponent(messageId)}`
    );
  }
}
