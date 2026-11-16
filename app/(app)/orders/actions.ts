'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/auth/guards';
import { CAN } from '@/lib/auth/roles';
import { acceptOrder, rejectOrder } from '@/lib/orders/transition';
import { requestInfo } from '@/lib/request-info';
import type { Result } from '@/lib/users';

export type OrderActionResult = Result<{ message?: string }>;

const NOT_ALLOWED: OrderActionResult = { ok: false, error: 'Your session ended or your role can’t do this. Sign in again or ask an admin.' };

export async function acceptOrderAction(orderId: string): Promise<OrderActionResult> {
  const actor = await currentUser(CAN.decideOrders);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const r = await acceptOrder(actor, orderId, ip);
  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);
  return r.ok ? { ok: true, message: 'Accepted. It now waits for the specimen at check-in.' } : r;
}

export async function rejectOrderAction(orderId: string, _prev: OrderActionResult | undefined, formData: FormData): Promise<OrderActionResult> {
  const actor = await currentUser(CAN.decideOrders);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const r = await rejectOrder(actor, orderId, String(formData.get('reason') ?? ''), String(formData.get('detail') ?? ''), ip);
  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);
  return r.ok ? { ok: true, message: 'Rejected. The reason is kept with the order.' } : r;
}
