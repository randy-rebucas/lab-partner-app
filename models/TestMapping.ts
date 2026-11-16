import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// How one connected clinic names a catalog test (FR-8). MyClinicSoft sends `test.type` (free text,
// e.g. "CBC") and sometimes `test.code`. A mapping matches on the code, or on the name compared
// without case or punctuation (lib/catalog/names.ts).

const TestMappingSchema = new Schema(
  {
    labId: { type: Schema.Types.ObjectId, ref: 'Lab', required: true },
    clinicId: { type: Schema.Types.ObjectId, ref: 'ConnectedClinic', required: true },
    /** As typed by the lab, for display. */
    clinicTestType: { type: String, trim: true },
    /** normaliseTestName(clinicTestType), used for matching. */
    clinicTestTypeKey: { type: String },
    clinicTestCode: { type: String, trim: true },
    /** clinicTestCode in lower case, used for matching. */
    clinicTestCodeKey: { type: String },
    testId: { type: Schema.Types.ObjectId, ref: 'TestDefinition', required: true },
  },
  { timestamps: true }
);

TestMappingSchema.index(
  { clinicId: 1, clinicTestCodeKey: 1 },
  { unique: true, partialFilterExpression: { clinicTestCodeKey: { $type: 'string' } } }
);
TestMappingSchema.index(
  { clinicId: 1, clinicTestTypeKey: 1 },
  { unique: true, partialFilterExpression: { clinicTestTypeKey: { $type: 'string' } } }
);
TestMappingSchema.index({ labId: 1, testId: 1 });

export type TestMappingDoc = InferSchemaType<typeof TestMappingSchema> & { _id: mongoose.Types.ObjectId };

export const TestMapping: Model<TestMappingDoc> =
  (mongoose.models.TestMapping as Model<TestMappingDoc>) || mongoose.model<TestMappingDoc>('TestMapping', TestMappingSchema);
