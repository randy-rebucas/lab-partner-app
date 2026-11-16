import mongoose, { Schema, type Model } from 'mongoose';

// Named sequences, e.g. "accession:261116" for that day's accession numbers.
const CounterSchema = new Schema({
  key: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

CounterSchema.index({ key: 1 }, { unique: true });

export type CounterDoc = { key: string; seq: number };

export const Counter: Model<CounterDoc> = (mongoose.models.Counter as Model<CounterDoc>) || mongoose.model<CounterDoc>('Counter', CounterSchema);

/** The next number in a sequence, starting at 1. Safe under concurrent calls. */
export async function nextSeq(key: string): Promise<number> {
  const c = await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { upsert: true, new: true, lean: true });
  return c!.seq;
}
