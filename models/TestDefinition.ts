import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// A test the lab performs (FR-7). Analytes carry their own units, reference ranges by sex and age
// band, and critical limits. Rules live in lib/catalog; this file only describes the shape.

const RangeSchema = new Schema(
  {
    sex: { type: String, enum: ['any', 'male', 'female'], default: 'any' },
    /** Age band in days, from ageMinDays up to (not including) ageMaxDays. Missing = no limit. */
    ageMinDays: { type: Number },
    ageMaxDays: { type: Number },
    low: { type: Number },
    high: { type: Number },
    /** For text results ("Negative", "Yellow"), the expected normal; also a printed note for numbers. */
    text: { type: String, trim: true },
  },
  { _id: false }
);

const AnalyteSchema = new Schema(
  {
    /** Stable key sent to MyClinicSoft (results.<key>). Lowercase letters, digits and underscores. */
    key: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    unit: { type: String, trim: true },
    kind: { type: String, enum: ['number', 'text'], default: 'number' },
    ranges: { type: [RangeSchema], default: [] },
    criticalLow: { type: Number },
    criticalHigh: { type: Number },
  },
  { _id: false }
);

const TestDefinitionSchema = new Schema(
  {
    labId: { type: Schema.Types.ObjectId, ref: 'Lab', required: true },
    code: { type: String, required: true, trim: true },
    loinc: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    section: { type: String, required: true },
    specimenType: { type: String, required: true },
    turnaroundHours: { type: Number, required: true },
    /** Names clinics commonly use for this test; "Add common names" maps them for a clinic in one step. */
    aliases: { type: [String], default: [] },
    analytes: { type: [AnalyteSchema], default: [] },
    active: { type: Boolean, default: true },
    /** Seeded example data whose ranges nobody at the lab has checked yet. */
    sample: { type: Boolean, default: false },
  },
  { timestamps: true }
);

TestDefinitionSchema.index({ labId: 1, code: 1 }, { unique: true });

export type TestDefinitionDoc = InferSchemaType<typeof TestDefinitionSchema> & { _id: mongoose.Types.ObjectId };

export const TestDefinition: Model<TestDefinitionDoc> =
  (mongoose.models.TestDefinition as Model<TestDefinitionDoc>) || mongoose.model<TestDefinitionDoc>('TestDefinition', TestDefinitionSchema);
