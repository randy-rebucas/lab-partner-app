import 'server-only';
import { Readable } from 'node:stream';
import mongoose, { Types } from 'mongoose';
import { connectDB } from '@/lib/db';

// Attachment storage (FR-12) behind one small interface, so moving to S3-compatible storage later
// changes only this file. Today: MongoDB GridFS, bucket "attachments".

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };

export interface FileStore {
  put(name: string, contentType: string, data: Buffer, meta: Record<string, unknown>): Promise<string>;
  get(id: string): Promise<{ data: Buffer; contentType: string; name: string; labId?: string } | null>;
  delete(id: string): Promise<void>;
}

async function bucket() {
  await connectDB();
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: 'attachments' });
}

export const fileStore: FileStore = {
  async put(name, contentType, data, meta) {
    const b = await bucket();
    const upload = b.openUploadStream(name, { metadata: { ...meta, contentType } });
    await new Promise<void>((resolve, reject) => {
      Readable.from(data).pipe(upload).on('finish', () => resolve()).on('error', reject);
    });
    return String(upload.id);
  },
  async get(id) {
    if (!Types.ObjectId.isValid(id)) return null;
    const b = await bucket();
    const [file] = await b.find({ _id: new Types.ObjectId(id) }).toArray();
    if (!file) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of b.openDownloadStream(file._id)) chunks.push(chunk as Buffer);
    const meta = (file.metadata ?? {}) as { contentType?: string; labId?: string };
    return { data: Buffer.concat(chunks), contentType: meta.contentType ?? 'application/octet-stream', name: file.filename, labId: meta.labId };
  },
  async delete(id) {
    if (!Types.ObjectId.isValid(id)) return;
    const b = await bucket();
    await b.delete(new Types.ObjectId(id)).catch(() => undefined);
  },
};

/** The file's real type from its first bytes; the browser's claim is not trusted. */
export function sniffType(data: Buffer): string | null {
  if (data.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  return null;
}
