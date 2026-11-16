import 'server-only';
import { headers } from 'next/headers';

/** Client IP and user agent of the current request, for the audit log and session records. */
export async function requestInfo(): Promise<{ ip: string | undefined; userAgent: string | undefined }> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return {
    ip: forwarded || h.get('x-real-ip') || undefined,
    userAgent: h.get('user-agent') || undefined,
  };
}

/** Manila time for messages shown to people ("Try again after 10:15 AM"). */
export function manilaTime(date: Date): string {
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
}
