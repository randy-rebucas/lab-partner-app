import { afterEach, describe, expect, it } from 'vitest';
import { setupTestDb } from '../helpers/db';
import { CBC_NORMAL, setupLab, startClinicServer } from '../helpers/flow';
import { classify, nextAttemptAt } from '@/lib/delivery/schedule';
import { buildPayload, manilaIso } from '@/lib/delivery/payload';
import { retryDelivery, runDueDeliveries } from '@/lib/delivery/run';
import { amendResult, newReportSerial, recordCriticalCall, releaseResult, saveResult, sendBack } from '@/lib/results';
import { manilaInputValue } from '@/lib/specimen-options';
import { Delivery } from '@/models/Delivery';
import { Order } from '@/models/Order';
import { Result } from '@/models/Result';

setupTestDb();

let closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.map((c) => c()));
  closers = [];
});

async function withClinic() {
  const server = await startClinicServer();
  closers.push(server.close);
  const lab = await setupLab(server.url);
  server.state.secret = lab.clinic.webhookSecret;
  const order = async (test = 'CBC', patient: Record<string, unknown> = {}) => {
    const o = await lab.collectedOrder(test, patient);
    server.state.sent.push({ requestCode: o.requestCode, requestId: o.requestId, testType: test, resultIds: [] });
    return o;
  };
  return { ...lab, server, order };
}

const status = async (orderId: string) => (await Order.findById(orderId).lean())?.status;

describe('result entry', () => {
  it('flags values for the patient’s sex and age; a draft starts the order', async () => {
    const { medtech, order } = await withClinic();
    const { orderId } = await order();
    expect(await saveResult(medtech, orderId, { values: { hb: '11.0', wbc: '12' }, submit: false })).toMatchObject({ ok: true, submitted: false });
    expect(await status(orderId)).toBe('in-progress');
    const r = await Result.findOne({ orderId }).lean();
    const hb = r!.values.find((v) => v.key === 'hb')!;
    expect(hb).toMatchObject({ flag: 'L', direction: 'low', range: '12-15.5 g/dL' }); // adult female band
    expect(r!.values.find((v) => v.key === 'wbc')).toMatchObject({ flag: 'H' });
    expect(r!.version).toBe(1);
  });

  it('needs every value to submit, and real numbers', async () => {
    const { medtech, order } = await withClinic();
    const { orderId } = await order();
    const missing = await saveResult(medtech, orderId, { values: { hb: '13' }, submit: true });
    expect(missing).toMatchObject({ ok: false, fieldErrors: { 'v.wbc': expect.stringMatching(/Not done/) } });
    const bad = await saveResult(medtech, orderId, { values: { ...CBC_NORMAL, hb: 'thirteen' }, submit: false });
    expect(bad).toMatchObject({ ok: false, fieldErrors: { 'v.hb': expect.stringMatching(/number/) } });
    expect((await saveResult(medtech, orderId, { values: { ...CBC_NORMAL, baso: '<0.5', mono: 'Not done' }, submit: true })).ok).toBe(true);
    expect(await status(orderId)).toBe('awaiting-validation');
  });
});

describe('validation and release', () => {
  it('the person who entered the values can never release them, even as a signatory', async () => {
    const { path, path2, order } = await withClinic();
    const { orderId } = await order();
    await saveResult(path, orderId, { values: CBC_NORMAL, submit: true });
    expect(await releaseResult(path, orderId)).toMatchObject({ ok: false, error: expect.stringMatching(/another signatory/) });
    expect((await releaseResult(path2, orderId)).ok).toBe(true);
  });

  it('a medtech without the signatory role can’t release', async () => {
    const { medtech, order } = await withClinic();
    const { orderId } = await order();
    await saveResult(medtech, orderId, { values: CBC_NORMAL, submit: true });
    expect(await releaseResult(medtech, orderId)).toMatchObject({ ok: false, error: 'Only a signatory releases results.' });
  });

  it('a critical value blocks release until the call is recorded', async () => {
    const { medtech, path, order } = await withClinic();
    const { orderId } = await order();
    await saveResult(medtech, orderId, { values: { ...CBC_NORMAL, hb: '5.1' }, submit: true });
    expect(await releaseResult(path, orderId)).toMatchObject({ ok: false, error: expect.stringMatching(/call to the clinic/) });
    expect(await recordCriticalCall(medtech, orderId, { takenBy: '', at: '' })).toMatchObject({ fieldErrors: { takenBy: expect.any(String), at: expect.any(String) } });
    expect((await recordCriticalCall(medtech, orderId, { takenBy: 'Nurse Joy Bautista', at: manilaInputValue() })).ok).toBe(true);
    const released = await releaseResult(path, orderId);
    expect(released).toMatchObject({ ok: true, serial: expect.stringMatching(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/) });
    const d = await Delivery.findOne().lean();
    const body = JSON.parse(d!.body);
    expect(body.abnormalFlags.hb).toBe('low');
    expect(body.interpretation).toMatch(/Critical: hb 5.1 g\/dL/);
    expect(body.resultId).toMatch(/^\d{6}-\d{4}-v1$/);
  });

  it('sending back returns the result to entry with the note', async () => {
    const { medtech, path, order } = await withClinic();
    const { orderId } = await order();
    await saveResult(medtech, orderId, { values: CBC_NORMAL, submit: true });
    expect(await sendBack(path, orderId, ' ')).toMatchObject({ fieldErrors: { note: expect.any(String) } });
    expect((await sendBack(path, orderId, 'Recheck platelets')).ok).toBe(true);
    expect(await status(orderId)).toBe('in-progress');
    expect(await Result.findOne({ orderId }).lean()).toMatchObject({ status: 'draft', sentBackNote: 'Recheck platelets', version: 1 });
  });
});

describe('delivery', () => {
  it('delivers a correctly signed result; the order becomes delivered; a repeat run sends nothing', async () => {
    const { medtech, path, order, server } = await withClinic();
    const { orderId } = await order();
    await saveResult(medtech, orderId, { values: CBC_NORMAL, interpretation: 'Normal CBC', submit: true });
    const rel = await releaseResult(path, orderId);
    if (!rel.ok) throw new Error('release');
    expect(await runDueDeliveries()).toMatchObject({ attempted: 1, delivered: 1 });
    expect(server.state.received[0].status).toBe(200);
    expect(await status(orderId)).toBe('delivered');
    expect(await runDueDeliveries()).toMatchObject({ attempted: 0 });
  });

  it('retries on 500 and flags on 401', async () => {
    const { medtech, path, order, server, labId } = await withClinic();
    const { orderId } = await order();
    await saveResult(medtech, orderId, { values: CBC_NORMAL, submit: true });
    await releaseResult(path, orderId);
    server.state.failWith = 500;
    expect(await runDueDeliveries()).toMatchObject({ retrying: 1 });
    let d = await Delivery.findOne().lean();
    expect(d).toMatchObject({ attempts: 1, lastStatus: 500, flagged: false });
    expect(d!.nextAttemptAt!.getTime() - d!.lastAttemptAt!.getTime()).toBe(60_000);
    expect(await runDueDeliveries()).toMatchObject({ attempted: 0 }); // not due yet

    server.state.failWith = 401;
    expect(await runDueDeliveries({ now: new Date(Date.now() + 61_000) })).toMatchObject({ flagged: 1 });
    d = await Delivery.findOne().lean();
    expect(d).toMatchObject({ flagged: true, lastStatus: 401, flagReason: expect.stringMatching(/clock.*webhook secret/) });
    expect(await status(orderId)).toBe('released');

    server.state.failWith = null;
    expect(await retryDelivery(labId, String(d!._id))).toBe(true);
    expect(await runDueDeliveries()).toMatchObject({ delivered: 1 });
    expect(await status(orderId)).toBe('delivered');
  });

  it('two runners at once send each attempt once', async () => {
    const { medtech, path, order, server } = await withClinic();
    const { orderId } = await order();
    await saveResult(medtech, orderId, { values: CBC_NORMAL, submit: true });
    await releaseResult(path, orderId);
    await Promise.all([runDueDeliveries(), runDueDeliveries(), runDueDeliveries()]);
    expect(server.state.received).toHaveLength(1);
  });
});

describe('corrections', () => {
  it('version 2 supersedes version 1, needs a reason and a fresh release, and is delivered with -v2', async () => {
    const { medtech, path, path2, order, server } = await withClinic();
    const { orderId } = await order();
    await saveResult(medtech, orderId, { values: CBC_NORMAL, submit: true });
    await releaseResult(path, orderId);
    await runDueDeliveries();

    expect(await amendResult(medtech, orderId, { values: CBC_NORMAL, reason: '' })).toMatchObject({ fieldErrors: { reason: expect.any(String) } });
    expect((await amendResult(medtech, orderId, { values: { ...CBC_NORMAL, plt: '120' }, reason: 'Platelet count re-run on a fresh smear' })).ok).toBe(true);
    expect(await status(orderId)).toBe('awaiting-validation');
    const [v2, v1] = await Result.find({ orderId }).sort({ version: -1 }).lean();
    expect(String(v1.supersededBy)).toBe(String(v2._id));
    expect(v2).toMatchObject({ version: 2, status: 'submitted', amendReason: 'Platelet count re-run on a fresh smear' });

    expect((await releaseResult(path2, orderId)).ok).toBe(true);
    expect(await runDueDeliveries()).toMatchObject({ delivered: 1 });
    const last = server.state.received.at(-1)!;
    expect(last.status).toBe(200);
    expect((last.body as { resultId: string }).resultId).toMatch(/-v2$/);
    expect((last.body as { interpretation: string }).interpretation).toMatch(/^Corrected result: Platelet count/);
    expect((last.body as { abnormalFlags: Record<string, string> }).abnormalFlags.plt).toBe('low');
    expect(await status(orderId)).toBe('delivered');
  });
});

describe('helpers', () => {
  it('schedules retries at 1, 5, 15, 60 minutes then hourly, giving up after 24 hours', () => {
    const t0 = new Date('2026-11-16T00:00:00Z');
    const mins = (n: number) => new Date(t0.getTime() + n * 60_000);
    expect(nextAttemptAt(1, t0, t0)).toEqual(mins(1));
    expect(nextAttemptAt(2, t0, mins(1))).toEqual(mins(6));
    expect(nextAttemptAt(3, t0, mins(6))).toEqual(mins(21));
    expect(nextAttemptAt(4, t0, mins(21))).toEqual(mins(81));
    expect(nextAttemptAt(9, t0, mins(23 * 60))).toEqual(mins(24 * 60));
    expect(nextAttemptAt(10, t0, mins(23 * 60 + 30))).toBeNull();
  });
  it('classifies replies as the contract says', () => {
    expect(classify(200).kind).toBe('delivered');
    for (const s of [400, 401, 404, 409, 302, 403]) expect(classify(s).kind, String(s)).toBe('flag');
    for (const s of [500, 502, 503, 429]) expect(classify(s).kind, String(s)).toBe('retry');
    expect(classify(null, 'timeout').kind).toBe('retry');
  });
  it('builds the body with only high/low/normal and Manila time', () => {
    expect(manilaIso(new Date('2026-11-16T01:30:00Z'))).toBe('2026-11-16T09:30:00+08:00');
    const b = buildPayload({
      requestId: 'ord_1',
      requestCode: 'LR-1',
      resultIdString: '261116-0001-v1',
      testType: 'CBC',
      values: [
        { key: 'hb', name: 'Hb', unit: 'g/dL', kind: 'number', value: '13.2', flag: null, direction: null, range: '12-15.5 g/dL' },
        { key: 'color', name: 'Color', kind: 'text', value: 'Yellow', range: 'Yellow' },
        { key: 'mono', name: 'Mono', kind: 'number', value: '' },
      ],
      releasedAt: new Date('2026-11-16T01:30:00Z'),
      labName: 'Sample Lab',
    });
    expect(b.results).toEqual({ hb: 13.2, color: 'Yellow' });
    expect(b.abnormalFlags).toEqual({ hb: 'normal', color: 'normal' });
    expect(b.interpretation).toBe('See values');
    expect(newReportSerial()).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });
});
