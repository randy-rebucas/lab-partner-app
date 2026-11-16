import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// One results webhook to send: one per released result version (FR-15). The body is built and
// frozen at release, so every retry sends (and signs) the same bytes.
const DeliverySchema = new Schema(
  {
    labId: { type: Schema.Types.ObjectId, ref: 'Lab', required: true },
    resultId: { type: Schema.Types.ObjectId, ref: 'Result', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'ConnectedClinic', required: true },
    resultIdString: { type: String, required: true },
    body: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    firstAttemptAt: { type: Date },
    lastAttemptAt: { type: Date },
    lastStatus: { type: Number },
    lastError: { type: String },
    nextAttemptAt: { type: Date },
    /** A runner holds the row until then, so two runners never send the same attempt. */
    lockedUntil: { type: Date },
    deliveredAt: { type: Date },
    flagged: { type: Boolean, default: false },
    flagReason: { type: String },
  },
  { timestamps: true }
);

DeliverySchema.index({ resultId: 1 }, { unique: true });
DeliverySchema.index({ deliveredAt: 1, flagged: 1, nextAttemptAt: 1 });
DeliverySchema.index({ orderId: 1 });

export type DeliveryDoc = InferSchemaType<typeof DeliverySchema> & { _id: mongoose.Types.ObjectId };

export const Delivery: Model<DeliveryDoc> = (mongoose.models.Delivery as Model<DeliveryDoc>) || mongoose.model<DeliveryDoc>('Delivery', DeliverySchema);
