'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/guards';
import { addSampleTests, createTest, setTestActive, updateTest } from '@/lib/catalog/tests';
import { requestInfo } from '@/lib/request-info';
import type { Result } from '@/lib/users';

export type CatalogActionResult = Result<{ message?: string }>;

const NOT_ALLOWED: CatalogActionResult = { ok: false, error: 'Your session ended or your role changed. Sign in again.' };

function readTest(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get('test') ?? ''));
  } catch {
    return null;
  }
}

/** Create (testId null) or save a test. A new test opens its own page. */
export async function saveTestAction(testId: string | null, _prev: CatalogActionResult | undefined, formData: FormData): Promise<CatalogActionResult> {
  const actor = await currentUser(['admin']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const input = readTest(formData);
  if (!testId) {
    const r = await createTest(actor, input, ip);
    if (!r.ok) return r;
    revalidatePath('/admin/catalog');
    redirect(`/admin/catalog/${r.testId}?created=1`);
  }
  const r = await updateTest(actor, testId, input, ip);
  if (!r.ok) return r;
  revalidatePath('/admin/catalog');
  revalidatePath(`/admin/catalog/${testId}`);
  return { ok: true, message: 'Saved. New orders and results use these settings from now on.' };
}

export async function testStepAction(testId: string, step: 'switch-off' | 'switch-on'): Promise<CatalogActionResult> {
  const actor = await currentUser(['admin']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const on = step === 'switch-on';
  const r = await setTestActive(actor, testId, on, ip);
  if (!r.ok) return r;
  revalidatePath('/admin/catalog');
  revalidatePath(`/admin/catalog/${testId}`);
  return { ok: true, message: on ? 'Switched on. Clinics can order this test again.' : 'Switched off. New orders for this test are refused; orders already here carry on.' };
}

export async function addSampleTestsAction(): Promise<CatalogActionResult> {
  const actor = await currentUser(['admin']);
  if (!actor) return NOT_ALLOWED;
  const { ip } = await requestInfo();
  const added = await addSampleTests(actor.labId, actor, ip);
  revalidatePath('/admin/catalog');
  return added
    ? { ok: true, message: `Added ${added} sample tests. Check every range against your analyser before releasing results.` }
    : { ok: true, message: 'The sample tests are already in the catalog.' };
}
