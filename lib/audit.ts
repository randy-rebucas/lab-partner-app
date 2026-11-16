import 'server-only';
import type { Types } from 'mongoose';
import { AuditEvent } from '@/models/AuditEvent';

export type AuditInput = {
  action: string;
  labId?: Types.ObjectId | string;
  userId?: Types.ObjectId | string;
  actor?: string;
  entity?: string;
  entityId?: Types.ObjectId | string;
  before?: unknown;
  after?: unknown;
  ip?: string;
};

/**
 * Record an audit event. Never throws: a failed audit write is logged, and the action it
 * describes still completes (the alternative, failing clinical work over a log write, is worse).
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await AuditEvent.create({
      ...input,
      entityId: input.entityId ? String(input.entityId) : undefined,
      at: new Date(),
    });
  } catch (error) {
    console.error('Audit write failed', input.action, error);
  }
}
