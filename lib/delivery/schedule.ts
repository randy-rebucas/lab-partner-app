// When to try again (contract §2): 1, 5, 15 and 60 minutes, then hourly, for up to 24 hours.

const DELAYS_MIN = [1, 5, 15, 60];
export const GIVE_UP_AFTER_MS = 24 * 3_600_000;

/** The next attempt after `attempts` failures, or null when the 24 hours are used up. */
export function nextAttemptAt(attempts: number, firstAttemptAt: Date, now: Date): Date | null {
  const delay = (DELAYS_MIN[attempts - 1] ?? 60) * 60_000;
  const next = new Date(now.getTime() + delay);
  return next.getTime() - firstAttemptAt.getTime() > GIVE_UP_AFTER_MS ? null : next;
}

export type Outcome = { kind: 'delivered' } | { kind: 'flag'; reason: string } | { kind: 'retry'; reason: string };

/** What a reply (or a failure to get one) means for the delivery. */
export function classify(status: number | null, error?: string): Outcome {
  if (status === null) return { kind: 'retry', reason: error || 'No answer' };
  if (status >= 200 && status < 300) return { kind: 'delivered' };
  if (status === 401) return { kind: 'flag', reason: 'The clinic refused the signature (401). Check this server’s clock and the clinic’s webhook secret.' };
  if (status === 404) return { kind: 'flag', reason: 'The clinic has no matching request (404). Check the request code with the clinic.' };
  if (status === 409) return { kind: 'flag', reason: 'The clinic matched more than one request (409). Contact the clinic.' };
  if (status === 400) return { kind: 'flag', reason: 'The clinic refused the result as invalid (400).' };
  if (status >= 300 && status < 400) return { kind: 'flag', reason: `The clinic’s address redirected (${status}). Check the MyClinicSoft address on the clinic’s page.` };
  if (status === 503 || status >= 500 || status === 429 || status === 408) return { kind: 'retry', reason: `The clinic answered ${status}.` };
  return { kind: 'flag', reason: `The clinic answered ${status}.` };
}
