import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const ApiKeySchema = new Schema(
  {
    /** The visible part, `lpk_<prefix>_…`, used to find the clinic before comparing the hash. */
    prefix: { type: String, required: true },
    /** SHA-256 of the whole key. Keys are 32 random bytes, so a fast hash is safe here. */
    hash: { type: String, required: true },
    createdAt: { type: Date, required: true },
    /** Set when the key is replaced: the old key keeps working until then (7-day overlap). */
    expiresAt: { type: Date },
    lastUsedAt: { type: Date },
  },
  { _id: false }
);

const ConnectedClinicSchema = new Schema(
  {
    labId: { type: Schema.Types.ObjectId, ref: 'Lab', required: true },
    name: { type: String, required: true, trim: true },
    /** This lab's code at MyClinicSoft (LAB_INTEGRATIONS[].labCode), sent as X-Lab-Code on results. */
    mcsLabCode: { type: String, required: true, trim: true },
    /** Base URL of the clinic's MyClinicSoft platform, where results are sent. */
    platformHost: { type: String, required: true, trim: true },
    /** The clinic's tenant id at MyClinicSoft, if known (goes into LAB_INTEGRATIONS[].tenantIds). */
    mcsTenantId: { type: String, trim: true },
    apiKeys: { type: [ApiKeySchema], default: [] },
    /** Signs results sent to the clinic. Encrypted at rest (lib/crypto.ts). */
    webhookSecretEnc: { type: String, required: true },
    active: { type: Boolean, default: true },
    contactName: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
  },
  { timestamps: true }
);

ConnectedClinicSchema.index({ 'apiKeys.prefix': 1 });
ConnectedClinicSchema.index({ labId: 1, name: 1 });

export type ConnectedClinicDoc = InferSchemaType<typeof ConnectedClinicSchema> & { _id: mongoose.Types.ObjectId };

export const ConnectedClinic: Model<ConnectedClinicDoc> =
  (mongoose.models.ConnectedClinic as Model<ConnectedClinicDoc>) || mongoose.model<ConnectedClinicDoc>('ConnectedClinic', ConnectedClinicSchema);
