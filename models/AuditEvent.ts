import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/** Append-only. There is no update or delete path for audit events anywhere in the code. */
const AuditEventSchema = new Schema({
  labId: { type: Schema.Types.ObjectId, ref: 'Lab' },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  /** Who acted when there is no user: `system`, `clinic:<id>`, or an email that failed to sign in. */
  actor: { type: String },
  action: { type: String, required: true },
  entity: { type: String },
  entityId: { type: String },
  before: { type: Schema.Types.Mixed },
  after: { type: Schema.Types.Mixed },
  ip: { type: String },
  at: { type: Date, required: true, default: () => new Date() },
});

AuditEventSchema.index({ labId: 1, at: -1 });
AuditEventSchema.index({ entity: 1, entityId: 1, at: -1 });

export type AuditEventDoc = InferSchemaType<typeof AuditEventSchema> & { _id: mongoose.Types.ObjectId };

export const AuditEvent: Model<AuditEventDoc> =
  (mongoose.models.AuditEvent as Model<AuditEventDoc>) || mongoose.model<AuditEventDoc>('AuditEvent', AuditEventSchema);
