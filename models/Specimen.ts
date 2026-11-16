import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { SPECIMEN_CONDITIONS } from '@/lib/specimen-options';

// One collected container (FR-5, FR-6). A rejected specimen stays on record; its recollection is a
// new specimen with a new accession number pointing back at it.


const SpecimenSchema = new Schema(
  {
    labId: { type: Schema.Types.ObjectId, ref: 'Lab', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    /** YYMMDD-NNNN, Manila date of collection (lib/specimens.ts). */
    accessionNo: { type: String, required: true },
    container: { type: String, required: true },
    collectedAt: { type: Date, required: true },
    /** Who drew or received the specimen. */
    collectedById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    collectedBy: { type: String, required: true },
    condition: { type: String, enum: SPECIMEN_CONDITIONS, required: true },
    note: { type: String },
    status: { type: String, enum: ['collected', 'rejected'], default: 'collected' },
    rejectedReason: { type: String },
    rejectedAt: { type: Date },
    rejectedBy: { type: String },
    /** The rejected specimen this one replaces. */
    recollectOf: { type: Schema.Types.ObjectId, ref: 'Specimen' },
  },
  { timestamps: true }
);

SpecimenSchema.index({ accessionNo: 1 }, { unique: true });
SpecimenSchema.index({ orderId: 1 });
SpecimenSchema.index({ labId: 1, collectedAt: -1 });

export type SpecimenDoc = InferSchemaType<typeof SpecimenSchema> & { _id: mongoose.Types.ObjectId };

export const Specimen: Model<SpecimenDoc> = (mongoose.models.Specimen as Model<SpecimenDoc>) || mongoose.model<SpecimenDoc>('Specimen', SpecimenSchema);
