import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// One version of an order's result (FR-10, FR-12 to FR-17). A correction is a new version; the old
// one stays, marked supersededBy, so what the clinic was sent can always be shown.

const ValueSchema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    unit: { type: String },
    kind: { type: String, enum: ['number', 'text'], default: 'number' },
    /** As typed. Empty means not done. */
    value: { type: String, default: '' },
    flag: { type: String, enum: ['H', 'L', 'C', null], default: null },
    direction: { type: String, enum: ['high', 'low', null], default: null },
    /** The reference range used, as printed and sent ("12-15.5 g/dL"). */
    range: { type: String, default: '' },
  },
  { _id: false }
);

const AttachmentSchema = new Schema(
  {
    fileId: { type: String, required: true },
    name: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    addedBy: { type: String, required: true },
    addedAt: { type: Date, required: true },
  },
  { _id: false }
);

const ResultSchema = new Schema(
  {
    labId: { type: Schema.Types.ObjectId, ref: 'Lab', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    version: { type: Number, required: true },
    /** draft → submitted (awaiting validation) → released. A sent-back result returns to draft. */
    status: { type: String, enum: ['draft', 'submitted', 'released'], default: 'draft' },
    values: { type: [ValueSchema], default: [] },
    interpretation: { type: String },
    attachments: { type: [AttachmentSchema], default: [] },
    enteredById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    enteredBy: { type: String, required: true },
    enteredByLicence: { type: String },
    enteredAt: { type: Date, required: true },
    submittedAt: { type: Date },
    sentBackNote: { type: String },
    /** Required before release when any value is critical (FR-14). */
    criticalCall: {
      calledById: { type: Schema.Types.ObjectId, ref: 'User' },
      calledBy: { type: String },
      takenBy: { type: String },
      at: { type: Date },
      note: { type: String },
    },
    releasedById: { type: Schema.Types.ObjectId, ref: 'User' },
    releasedBy: { type: String },
    releasedByLicence: { type: String },
    releasedAt: { type: Date },
    /** Printed on the report and checked at /verify/<serial>. */
    reportSerial: { type: String },
    /** `<accession>-v<version>`, the resultId MyClinicSoft receives. */
    resultIdString: { type: String },
    amendReason: { type: String },
    supersededBy: { type: Schema.Types.ObjectId, ref: 'Result' },
  },
  { timestamps: true }
);

ResultSchema.index({ orderId: 1, version: 1 }, { unique: true });
ResultSchema.index({ reportSerial: 1 }, { unique: true, partialFilterExpression: { reportSerial: { $type: 'string' } } });

export type ResultDoc = InferSchemaType<typeof ResultSchema> & { _id: mongoose.Types.ObjectId };

export const Result: Model<ResultDoc> = (mongoose.models.Result as Model<ResultDoc>) || mongoose.model<ResultDoc>('Result', ResultSchema);
