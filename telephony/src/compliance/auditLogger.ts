/**
 * Immutable Audit Logger.
 * Logs all data access and processing actions for DSGVO compliance.
 * In production, back this with an append-only database or file.
 */
import { v4 as uuidv4 } from 'uuid';
import { AuditEntry, AuditAction } from './types';

export class AuditLogger {
  /** In-memory append-only log. Replace with persistent store in production. */
  private _entries: AuditEntry[] = [];

  /**
   * Log an audit entry. Entries are immutable once created.
   */
  public log(params: {
    action: AuditAction;
    actor: string;
    resourceType: AuditEntry['resourceType'];
    resourceId: string;
    metadata?: Record<string, string | number | boolean>;
  }): AuditEntry {
    const entry: AuditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      action: params.action,
      actor: params.actor,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      metadata: params.metadata,
    };

    this._entries.push(entry);
    return entry;
  }

  /**
   * Query audit entries by resource.
   */
  public getByResource(resourceType: AuditEntry['resourceType'], resourceId: string): AuditEntry[] {
    return this._entries.filter(
      (e) => e.resourceType === resourceType && e.resourceId === resourceId
    );
  }

  /**
   * Query audit entries by action type.
   */
  public getByAction(action: AuditAction): AuditEntry[] {
    return this._entries.filter((e) => e.action === action);
  }

  /**
   * Query audit entries by actor.
   */
  public getByActor(actor: string): AuditEntry[] {
    return this._entries.filter((e) => e.actor === actor);
  }

  /**
   * Get all entries within a time range.
   */
  public getByTimeRange(from: string, to: string): AuditEntry[] {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    return this._entries.filter((e) => {
      const d = new Date(e.timestamp);
      return d >= fromDate && d <= toDate;
    });
  }

  /**
   * Get total entry count.
   */
  public count(): number {
    return this._entries.length;
  }

  /**
   * Export all entries (for DSGVO data export requests).
   */
  public exportAll(): AuditEntry[] {
    return [...this._entries];
  }

  /**
   * Remove entries older than a given date (for retention cleanup).
   * Returns number of removed entries.
   */
  public removeOlderThan(date: string): number {
    const threshold = new Date(date);
    const before = this._entries.length;
    this._entries = this._entries.filter((e) => new Date(e.timestamp) >= threshold);
    return before - this._entries.length;
  }
}
