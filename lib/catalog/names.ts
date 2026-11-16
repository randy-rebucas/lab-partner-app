// Comparing test names the way MyClinicSoft does (components/lab-results/panels.ts there):
// lower case, anything that isn't a letter or digit becomes one space. "CBC w/ Platelet" and
// "cbc w platelet" are the same name.
export function normaliseTestName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normaliseTestCode(code: string): string {
  return code.trim().toLowerCase();
}

export const SECTIONS = ['Hematology', 'Clinical microscopy', 'Clinical chemistry', 'Immunology and serology', 'Microbiology', 'Other'] as const;

export const SPECIMEN_TYPES = [
  'Whole blood (EDTA)',
  'Serum',
  'Plasma (fluoride)',
  'Plasma (citrate)',
  'Urine',
  'Stool',
  'Swab',
  'Other',
] as const;
