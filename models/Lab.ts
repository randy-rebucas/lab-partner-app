import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const LabSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    licenceNo: { type: String, trim: true },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    /** Extra lines printed under the lab name on result reports. */
    reportHeader: { type: String, trim: true },
  },
  { timestamps: true }
);

export type LabDoc = InferSchemaType<typeof LabSchema> & { _id: mongoose.Types.ObjectId };

export const Lab: Model<LabDoc> = (mongoose.models.Lab as Model<LabDoc>) || mongoose.model<LabDoc>('Lab', LabSchema);
