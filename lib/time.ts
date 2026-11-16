// Times are stored in UTC and shown in Asia/Manila (PLAN.md §2 lib/time.ts).

const TZ = 'Asia/Manila';

export function manilaDateTime(d: Date | string): string {
  return new Date(d).toLocaleString('en-PH', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function manilaClock(d: Date | string): string {
  return new Date(d).toLocaleTimeString('en-PH', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
}

/** "Today 9:41 AM", "Yesterday 4:05 PM", or "Nov 12, 4:05 PM". */
export function manilaWhen(d: Date | string, now = new Date()): string {
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: TZ });
  const date = new Date(d);
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (day(date) === day(now)) return `Today ${manilaClock(date)}`;
  if (day(date) === day(yesterday)) return `Yesterday ${manilaClock(date)}`;
  return date.toLocaleString('en-PH', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Elapsed time, short: "8 min", "3 h 05 min", "2 d 4 h". */
export function elapsed(from: Date | string, now = new Date()): string {
  const mins = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ${String(mins % 60).padStart(2, '0')} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** Age as staff say it: "7 y", "8 mo", "12 d". From a YYYY-MM-DD birth date. */
export function ageText(dateOfBirth: string | null | undefined, on = new Date()): string | null {
  if (!dateOfBirth) return null;
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  if (!y || !m || !d) return null;
  const today = on.toLocaleDateString('en-CA', { timeZone: TZ }).split('-').map(Number);
  let years = today[0] - y;
  let months = today[1] - m;
  if (today[2] < d) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years >= 2) return `${years} y`;
  const totalMonths = years * 12 + months;
  if (totalMonths >= 1) return `${totalMonths} mo`;
  const days = Math.floor((Date.UTC(today[0], today[1] - 1, today[2]) - Date.UTC(y, m - 1, d)) / 86_400_000);
  return `${Math.max(0, days)} d`;
}

/** "2019-04-02" → "Apr 2, 2019". */
export function birthDateText(dateOfBirth: string | null | undefined): string | null {
  if (!dateOfBirth) return null;
  const d = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-PH', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}
