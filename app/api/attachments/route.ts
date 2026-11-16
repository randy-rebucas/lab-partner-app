import { NextResponse, type NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { audit } from '@/lib/audit';
import { currentUser } from '@/lib/auth/guards';
import { connectDB } from '@/lib/db';
import { ATTACHMENT_TYPES, fileStore, MAX_ATTACHMENT_BYTES, sniffType } from '@/lib/files';
import { Order } from '@/models/Order';
import { Result } from '@/models/Result';

// POST /api/attachments  (multipart: orderId, file) — attach a PDF or image to the result being
// entered (FR-12). A route rather than a server action because files run up to 10 MB.

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const err = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return err(403, 'Upload from the lab app only.');
  const actor = await currentUser(['medtech', 'signatory']);
  if (!actor) return err(401, 'Your session ended. Sign in again.');
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_ATTACHMENT_BYTES + 64 * 1024) return err(413, 'Files can be up to 10 MB.');

  const form = await request.formData().catch(() => null);
  const orderId = String(form?.get('orderId') ?? '');
  const file = form?.get('file');
  if (!Types.ObjectId.isValid(orderId) || !(file instanceof File)) return err(400, 'Choose a file.');
  if (file.size > MAX_ATTACHMENT_BYTES) return err(413, 'Files can be up to 10 MB.');
  const data = Buffer.from(await file.arrayBuffer());
  const type = sniffType(data);
  if (!type || !ATTACHMENT_TYPES[type]) return err(415, 'Attach a PDF, PNG or JPEG file.');

  await connectDB();
  const order = await Order.findOne({ _id: orderId, labId: actor.labId }).select('status').lean();
  if (!order) return err(404, 'That order no longer exists.');
  const result = await Result.findOne({ orderId, status: 'draft' }).sort({ version: -1 }).select('_id').lean();
  if (!result) return err(409, 'Save a draft of the values first; files attach to a draft.');

  const name = (file.name || `attachment.${ATTACHMENT_TYPES[type]}`).replace(/[^\w.\- ()]/g, '_').slice(0, 120);
  const fileId = await fileStore.put(name, type, data, { labId: actor.labId, orderId });
  await Result.updateOne(
    { _id: result._id, status: 'draft' },
    { $push: { attachments: { fileId, name, contentType: type, size: data.length, addedBy: actor.name, addedAt: new Date() } } }
  );
  await audit({ action: 'attachment.added', labId: actor.labId, userId: actor.id, entity: 'Result', entityId: result._id, after: { fileId, name, size: data.length } });
  return NextResponse.json({ fileId, name });
}
