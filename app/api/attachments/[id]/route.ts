import { NextResponse, type NextRequest } from 'next/server';
import { audit } from '@/lib/audit';
import { currentUser } from '@/lib/auth/guards';
import { fileStore } from '@/lib/files';

// GET /api/attachments/<fileId> — open an attachment. Signed-in lab staff only; every view is logged.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await currentUser(['admin', 'medtech', 'signatory', 'front-desk']);
  if (!actor) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const { id } = await params;
  const file = await fileStore.get(id);
  if (!file || file.labId !== actor.labId) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  await audit({ action: 'attachment.viewed', labId: actor.labId, userId: actor.id, entity: 'Attachment', entityId: id });
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="${file.name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // No sandbox: it would stop the browser's own PDF viewer.
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'",
    },
  });
}
