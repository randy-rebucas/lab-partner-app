import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// Orders refused because the clinic's test name or code isn't mapped (422 UNKNOWN_TEST), one row
// per clinic per name/code, so the lab admin can see what to add on the clinic's Test names page.
// No patient details are kept. Rows go away 30 days after the last refusal.
const IntakeRefusalSchema = new Schema({
  labId: { type: Schema.Types.ObjectId, ref: 'Lab', required: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'ConnectedClinic', required: true },
  /** normaliseTestName(type) + '|' + normaliseTestCode(code) */
  key: { type: String, required: true },
  /** The two halves of key, so adding a name or a code clears the matching rows. */
  typeKey: { type: String },
  codeKey: { type: String },
  testType: { type: String },
  testCode: { type: String },
  reason: { type: String, enum: ['unmapped', 'test-off'], required: true },
  count: { type: Number, default: 0 },
  lastRequestCode: { type: String },
  firstAt: { type: Date, required: true },
  lastAt: { type: Date, required: true },
});

IntakeRefusalSchema.index({ clinicId: 1, key: 1 }, { unique: true });
IntakeRefusalSchema.index({ lastAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export type IntakeRefusalDoc = InferSchemaType<typeof IntakeRefusalSchema> & { _id: mongoose.Types.ObjectId };

export const IntakeRefusal: Model<IntakeRefusalDoc> =
  (mongoose.models.IntakeRefusal as Model<IntakeRefusalDoc>) || mongoose.model<IntakeRefusalDoc>('IntakeRefusal', IntakeRefusalSchema);
