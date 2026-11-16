import { describe, expect, it } from 'vitest';
import { ageInDays, describeBand, flagValue, formatRange, numericValue, pickRange, splitAge } from '@/lib/catalog/flags';
import { normaliseTestName } from '@/lib/catalog/names';
import { SAMPLE_TESTS } from '@/lib/catalog/sample';

const Y = 365;
const hb = SAMPLE_TESTS.find((t) => t.code === 'CBC')!.analytes.find((a) => a.key === 'hb')!;
const hdl = SAMPLE_TESTS.find((t) => t.code === 'LIPID')!.analytes.find((a) => a.key === 'hdl')!;

describe('picking the reference range', () => {
  it('prefers the band for the patient’s sex and age', () => {
    expect(pickRange(hb.ranges, 'female', 30 * Y)).toMatchObject({ low: 12, high: 15.5 });
    expect(pickRange(hb.ranges, 'male', 30 * Y)).toMatchObject({ low: 13.5, high: 17.5 });
    expect(pickRange(hb.ranges, 'male', 6 * Y)).toMatchObject({ low: 11.5 });
  });
  it('gives no band when none fits (an infant here) or the age is unknown and every band has one', () => {
    expect(pickRange(hb.ranges, 'male', 100)).toBeNull();
    expect(pickRange(hb.ranges, 'male', undefined)).toBeNull();
  });
  it('uses sex-only bands without an age', () => {
    expect(pickRange(hdl.ranges, 'female', undefined)).toMatchObject({ low: 50 });
  });
  it('treats the upper age as "under"', () => {
    const r = [{ ageMinDays: 0, ageMaxDays: 18 * Y, low: 1 }, { ageMinDays: 18 * Y, low: 2 }];
    expect(pickRange(r, undefined, 18 * Y)).toMatchObject({ low: 2 });
    expect(pickRange(r, undefined, 18 * Y - 1)).toMatchObject({ low: 1 });
  });
});

describe('flags', () => {
  const adultF = ['female', 40 * Y] as const;
  it('marks H, L, C and normal', () => {
    expect(flagValue(hb, '16.1', ...adultF)).toEqual({ flag: 'H', direction: 'high' });
    expect(flagValue(hb, '11.9', ...adultF)).toEqual({ flag: 'L', direction: 'low' });
    expect(flagValue(hb, '5.1', ...adultF)).toEqual({ flag: 'C', direction: 'low' });
    expect(flagValue(hb, '21', ...adultF)).toEqual({ flag: 'C', direction: 'high' });
    expect(flagValue(hb, '13', ...adultF)).toEqual({ flag: null, direction: null });
  });
  it('treats the range ends as normal', () => {
    expect(flagValue(hb, 12, ...adultF).flag).toBeNull();
    expect(flagValue(hb, 15.5, ...adultF).flag).toBeNull();
  });
  it('still flags critical values when no band fits', () => {
    expect(flagValue(hb, 5, 'male', undefined)).toEqual({ flag: 'C', direction: 'low' });
    expect(flagValue(hb, 10, 'male', undefined).flag).toBeNull();
  });
  it('never flags text', () => {
    expect(flagValue({ kind: 'text', ranges: [{ text: 'Negative' }] }, '2+', 'male', 1000).flag).toBeNull();
    expect(flagValue(hb, 'hemolysed', ...adultF).flag).toBeNull();
  });
});

describe('formatting', () => {
  it('prints ranges as MyClinicSoft shows them', () => {
    expect(formatRange({ low: 12, high: 16 }, 'g/dL')).toBe('12-16 g/dL');
    expect(formatRange({ high: 200 }, 'mg/dL')).toBe('<200 mg/dL');
    expect(formatRange({ low: 40 }, 'mg/dL')).toBe('>40 mg/dL');
    expect(formatRange({ text: 'Negative' })).toBe('Negative');
    expect(formatRange(null)).toBe('');
  });
  it('describes bands and splits ages', () => {
    expect(describeBand({ sex: 'female', ageMinDays: 18 * Y })).toBe('Female, 18 y and over');
    expect(describeBand({ ageMinDays: 30, ageMaxDays: 2 * Y })).toBe('Anyone, 1 mo under 2 y');
    expect(splitAge(18 * Y)).toEqual({ n: '18', unit: 'y' });
    expect(splitAge(60)).toEqual({ n: '2', unit: 'mo' });
    expect(splitAge(10)).toEqual({ n: '10', unit: 'd' });
  });
  it('reads numbers and ages', () => {
    expect(numericValue(' 5,100 ')).toBe(5100);
    expect(numericValue('.5')).toBe(0.5);
    expect(numericValue('5.1.2')).toBeNull();
    expect(ageInDays('2000-01-01', new Date('2000-01-11T08:00:00Z'))).toBe(10);
    expect(ageInDays('not a date', new Date())).toBeUndefined();
  });
});

describe('test names', () => {
  it('compares names the way MyClinicSoft does', () => {
    expect(normaliseTestName('CBC w/ Platelet')).toBe('cbc w platelet');
    expect(normaliseTestName('  Lipid-Profile ')).toBe('lipid profile');
  });
});
