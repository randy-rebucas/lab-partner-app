import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { ORDER_STATUSES, URGENCIES } from '@/lib/orders/status';

// A lab order received from a connected clinic (FR-1). The patient and test are copied as sent,
// so the order still reads correctly if the catalog or the clinic's records change later.

const StatusEntrySchema = new Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, required: true },
    /** A user id, or missing when the clinic's system did it (order received). */
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    by: { type: String, required: true },
    note: { type: String },
  },
  { _id: false }
);

const OrderSchema = new Schema(
  {
    labId: { type: Schema.Types.ObjectId, ref: 'Lab', required: true },
    /** This lab's id for the order, returned to MyClinicSoft and sent back on results. */
    requestId: { type: String, required: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'ConnectedClinic', required: true },
    /** The clinic's own reference (e.g. LR-000481). One order per clinic per requestCode. */
    requestCode: { type: String, required: true },
    urgency: { type: String, enum: URGENCIES, required: true },
    patient: {
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      /** YYYY-MM-DD as sent; missing when the clinic didn't have it. */
      dateOfBirth: { type: String },
      sex: { type: String, enum: ['male', 'female'] },
      /** The gender text as sent, when it wasn't plainly male or female. */
      genderText: { type: String },
      patientCode: { type: String },
    },
    test: {
      type: { type: String },
      code: { type: String },
      testId: { type: Schema.Types.ObjectId, ref: 'TestDefinition', required: true },
      /** Catalog code and name at the time the order arrived. */
      labCode: { type: String, required: true },
      labName: { type: String, required: true },
    },
    clinicalInfo: {
      diagnosis: { type: String },
      chiefComplaint: { type: String },
    },
    instructions: { type: String },
    /** Fields beyond today's contract (orderCode, tests[], clinicName, orderingDoctor…), kept as sent. */
    extras: { type: Schema.Types.Mixed },
    status: { type: String, enum: ORDER_STATUSES, required: true, default: 'received' },
    statusHistory: { type: [StatusEntrySchema], default: [] },
    rejectReason: { type: String },
    receivedAt: { type: Date, required: true },
    /** Identity check at the counter (FR-4). */
    checkIn: {
      at: { type: Date },
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      by: { type: String },
      idType: { type: String },
      note: { type: String },
    },
    /** The specimen in use; changes when a rejected specimen is recollected. */
    specimenId: { type: Schema.Types.ObjectId, ref: 'Specimen' },
    accessionNo: { type: String },
  },
  { timestamps: true, minimize: false }
);

OrderSchema.index({ clinicId: 1, requestCode: 1 }, { unique: true });
OrderSchema.index({ requestId: 1 }, { unique: true });
OrderSchema.index({ labId: 1, status: 1, urgency: 1, receivedAt: 1 });

export type OrderDoc = InferSchemaType<typeof OrderSchema> & { _id: mongoose.Types.ObjectId };

export const Order: Model<OrderDoc> = (mongoose.models.Order as Model<OrderDoc>) || mongoose.model<OrderDoc>('Order', OrderSchema);
