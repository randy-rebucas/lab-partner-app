import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { ROLES } from '@/lib/auth/roles';

const UserSchema = new Schema(
  {
    labId: { type: Schema.Types.ObjectId, ref: 'Lab', required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    roles: { type: [String], enum: ROLES, default: [] },
    /** Required for signatories: printed on released reports. */
    licenceNo: { type: String, trim: true },
    active: { type: Boolean, default: true },

    /** TOTP secret, encrypted (lib/crypto.ts). Set once the user confirms enrolment. */
    totpSecretEnc: { type: String },
    /** Secret shown during enrolment, not yet confirmed. */
    totpPendingSecretEnc: { type: String },
    /** Last accepted code and when, so one code can't be used twice. */
    totpLastCode: { type: String },
    totpLastAt: { type: Date },

    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    lastLoginAt: { type: Date },
    /** Must choose a new password at next sign-in (set by an admin reset). */
    mustChangePassword: { type: Boolean, default: false },
  },
  { timestamps: true }
);

UserSchema.index({ labId: 1, email: 1 }, { unique: true });

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };

export const User: Model<UserDoc> = (mongoose.models.User as Model<UserDoc>) || mongoose.model<UserDoc>('User', UserSchema);
