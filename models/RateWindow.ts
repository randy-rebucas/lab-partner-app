import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// One counter per clinic per minute for the order API's rate limit. MongoDB deletes each one
// shortly after its minute ends, so the collection stays tiny.
const RateWindowSchema = new Schema({
  key: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});

RateWindowSchema.index({ key: 1 }, { unique: true });
RateWindowSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RateWindowDoc = InferSchemaType<typeof RateWindowSchema>;

export const RateWindow: Model<RateWindowDoc> =
  (mongoose.models.RateWindow as Model<RateWindowDoc>) || mongoose.model<RateWindowDoc>('RateWindow', RateWindowSchema);
