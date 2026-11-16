/**
 * Send a sample order to the lab, exactly as MyClinicSoft does.   pnpm mock:order [options]
 *
 *   --test CBC            the clinic's test name (default CBC)
 *   --code 58410-2        the clinic's test code (optional)
 *   --stat | --urgent     urgency (default routine)
 *   --patient "Ana Reyes" --dob 2019-04-02 --sex female
 *   --request-code LR-1   default: a new one each time
 *   --count 5             send several orders (different patients and requestCodes)
 *
 * Uses the connection in e2e/.out/clinic.json (see state.ts). Remembers what it sent, so the mock
 * clinic server can match results to orders.
 */
import { parseArgs } from 'node:util';
import { connection, rememberSent } from './state';

const PATIENTS = [
  { firstName: 'Ana', lastName: 'Reyes', dateOfBirth: '2019-04-02', gender: 'female' },
  { firstName: 'Jose', lastName: 'Bautista', dateOfBirth: '1958-11-23', gender: 'male' },
  { firstName: 'Maria Clara', lastName: 'Santos', dateOfBirth: '1990-07-15', gender: 'female' },
  { firstName: 'Paolo', lastName: 'Dela Cruz', dateOfBirth: '2012-01-30', gender: 'male' },
  { firstName: 'Liza', lastName: 'Mendoza', dateOfBirth: '', gender: 'female' },
];

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: {
      test: { type: 'string', default: 'CBC' },
      code: { type: 'string' },
      stat: { type: 'boolean', default: false },
      urgent: { type: 'boolean', default: false },
      patient: { type: 'string' },
      dob: { type: 'string' },
      sex: { type: 'string' },
      'request-code': { type: 'string' },
      count: { type: 'string', default: '1' },
    },
  });
  const conn = connection();
  const count = Math.max(1, Math.min(50, Number(values.count) || 1));
  const urgency = values.stat ? 'stat' : values.urgent ? 'urgent' : 'routine';
  let failed = false;

  for (let i = 0; i < count; i++) {
    const base = PATIENTS[i % PATIENTS.length];
    const [firstName, ...rest] = (values.patient ?? '').trim().split(/\s+/);
    const patient = {
      ...base,
      ...(values.patient ? { firstName, lastName: rest.join(' ') || base.lastName } : {}),
      ...(values.dob !== undefined ? { dateOfBirth: values.dob } : {}),
      ...(values.sex ? { gender: values.sex } : {}),
      patientCode: `P-${String(1000 + i).padStart(5, '0')}`,
    };
    const requestCode = values['request-code'] && count === 1 ? values['request-code'] : `LR-${Date.now().toString(36).toUpperCase()}${count > 1 ? `-${i + 1}` : ''}`;
    const body = JSON.stringify({
      request: {
        requestCode,
        patient,
        test: { type: values.test, code: values.code, urgency },
        clinicalInfo: { diagnosis: 'Fever, unspecified', chiefComplaint: 'Fever for 3 days' },
        instructions: /fbs|fasting/i.test(values.test ?? '') ? 'Fasting 8 hours' : undefined,
      },
    });
    const res = await fetch(conn.apiEndpoint, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.apiKey}` },
      body,
    });
    const reply = (await res.json().catch(() => null)) as { requestId?: string; id?: string; error?: { code: string; message: string } } | null;
    const requestId = reply?.requestId || reply?.id;
    if (res.ok && requestId) {
      rememberSent({ requestCode, requestId, testType: values.test! });
      console.log(`${res.status}  ${requestCode}  ${patient.firstName} ${patient.lastName}  ${values.test} (${urgency})  → ${requestId}`);
    } else {
      failed = true;
      console.log(`${res.status}  ${requestCode}  refused: ${reply?.error?.code ?? ''} ${reply?.error?.message ?? JSON.stringify(reply)}`);
    }
  }
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
