/**
 * Data Retention Scheduler.
 * Enforces legal retention periods per German medical law:
 * - Audio recordings: 90 days (configurable)
 * - Transcripts & pre-docs: 10 years (§ 630f BGB)
 * - Consent records & audit logs: 10 years (DSGVO accountability)
 */
import { RetentionPolicy, DEFAULT_RETENTION_POLICIES, AuditAction } from './types';
import { AuditLogger } from './auditLogger';

/** Callback to delete resources by type + older-than date. */
export type DeleteResourceFn = (resourceType: string, olderThan: string) => Promise<number>;

export class RetentionScheduler {
  private _policies: RetentionPolicy[];
  private _auditLogger: AuditLogger;
  private _deleteResource: DeleteResourceFn;
  private _intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    auditLogger: AuditLogger,
    deleteResource: DeleteResourceFn,
    policies?: RetentionPolicy[]
  ) {
    this._auditLogger = auditLogger;
    this._deleteResource = deleteResource;
    this._policies = policies || DEFAULT_RETENTION_POLICIES;
  }

  /**
   * Run retention cleanup once.
   * Returns total number of deleted resources.
   */
  public async runCleanup(): Promise<number> {
    let totalDeleted = 0;
    const now = new Date();

    for (const policy of this._policies) {
      const cutoffDate = new Date(now);
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);
      const cutoffIso = cutoffDate.toISOString();

      try {
        const deleted = await this._deleteResource(policy.resourceType, cutoffIso);
        totalDeleted += deleted;

        if (deleted > 0) {
          this._auditLogger.log({
            action: AuditAction.RETENTION_CLEANUP,
            actor: 'retention-scheduler',
            resourceType: policy.resourceType as 'call' | 'transcript' | 'predoc' | 'consent' | 'audio',
            resourceId: 'batch',
            metadata: {
              deletedCount: deleted,
              cutoffDate: cutoffIso,
              retentionDays: policy.retentionDays,
              legalBasis: policy.legalBasis,
            },
          });
        }
      } catch (error) {
        console.error(
          `[RetentionScheduler] Failed to cleanup ${policy.resourceType}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    return totalDeleted;
  }

  /**
   * Start periodic retention cleanup.
   * @param intervalMs - How often to run cleanup (default: once per day)
   */
  public start(intervalMs: number = 24 * 60 * 60 * 1000): void {
    if (this._intervalHandle) {
      return;
    }
    // Run immediately, then on interval
    void this.runCleanup();
    this._intervalHandle = setInterval(() => void this.runCleanup(), intervalMs);
  }

  /**
   * Stop periodic retention cleanup.
   */
  public stop(): void {
    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }
  }

  /**
   * Get current retention policies.
   */
  public getPolicies(): RetentionPolicy[] {
    return [...this._policies];
  }
}
