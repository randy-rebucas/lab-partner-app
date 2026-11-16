import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const SessionSchema = new Schema({
  /** SHA-256 of the cookie token; the token itself is never stored. */
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  labId: { type: Schema.Types.ObjectId, ref: 'Lab', required: true },
  /** `mfa`: password accepted, waiting for the TOTP code. `full`: signed in. */
  stage: { type: String, enum: ['mfa', 'full'], required: true },
  createdAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  ip: { type: String },
  userAgent: { type: String },
});

// MongoDB removes expired sessions on its own.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionDoc = InferSchemaType<typeof SessionSchema> & { _id: mongoose.Types.ObjectId };

export const Session: Model<SessionDoc> =
  (mongoose.models.Session as Model<SessionDoc>) || mongoose.model<SessionDoc>('Session', SessionSchema);
