'use server';

import { revalidatePath } from 'next/cache';
import { audit } from '@/lib/audit';
import { currentUser } from '@/lib/auth/guards';
import { retryDelivery, runDueDeliveries } from '@/lib/delivery/run';
import type { Result } from '@/lib/users';

/** Send a delivery again now (a fresh 24-hour retry window), and wait for this one attempt. */
export async function retryDeliveryAction(deliveryId: string): Promise<Result> {
  const actor = await currentUser(['admin', 'front-desk', 'signatory']);
  if (!actor) return { ok: false, error: 'Your session ended. Sign in again.' };
  if (!(await retryDelivery(actor.labId, deliveryId))) return { ok: false, error: 'This delivery is already done.' };
  await audit({ action: 'delivery.retried', labId: actor.labId, userId: actor.id, entity: 'Delivery', entityId: deliveryId });
  await runDueDeliveries({ onlyId: deliveryId });
  revalidatePath('/deliveries');
  return { ok: true };
}
