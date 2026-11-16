// Sample catalog: five common tests so a new lab can try the flow end to end. Seeded with
// `sample: true`; the ranges are typical adult textbook values, NOT any analyser's. Every lab must
// check them against its own analyser and reagents before releasing results.

const Y = 365;

export type SampleTest = {
  code: string;
  loinc?: string;
  name: string;
  section: string;
  specimenType: string;
  turnaroundHours: number;
  aliases: string[];
  analytes: {
    key: string;
    name: string;
    unit?: string;
    kind?: 'number' | 'text';
    ranges: { sex?: 'any' | 'male' | 'female'; ageMinDays?: number; ageMaxDays?: number; low?: number; high?: number; text?: string }[];
    criticalLow?: number;
    criticalHigh?: number;
  }[];
};

const text = (key: string, name: string, normal: string) => ({ key, name, kind: 'text' as const, ranges: [{ text: normal }] });

export const SAMPLE_TESTS: SampleTest[] = [
  {
    code: 'CBC',
    loinc: '58410-2',
    name: 'Complete blood count',
    section: 'Hematology',
    specimenType: 'Whole blood (EDTA)',
    turnaroundHours: 4,
    aliases: ['CBC', 'Complete blood count', 'CBC with platelet', 'CBC with platelet count', 'Hemogram'],
    analytes: [
      {
        key: 'hb',
        name: 'Hemoglobin',
        unit: 'g/dL',
        ranges: [
          { sex: 'male', ageMinDays: 18 * Y, low: 13.5, high: 17.5 },
          { sex: 'female', ageMinDays: 18 * Y, low: 12, high: 15.5 },
          { ageMinDays: 1 * Y, ageMaxDays: 18 * Y, low: 11.5, high: 15.5 },
        ],
        criticalLow: 7,
        criticalHigh: 20,
      },
      {
        key: 'hct',
        name: 'Hematocrit',
        unit: '%',
        ranges: [
          { sex: 'male', ageMinDays: 18 * Y, low: 41, high: 53 },
          { sex: 'female', ageMinDays: 18 * Y, low: 36, high: 46 },
        ],
        criticalLow: 20,
        criticalHigh: 60,
      },
      {
        key: 'rbc',
        name: 'RBC',
        unit: '×10¹²/L',
        ranges: [
          { sex: 'male', ageMinDays: 18 * Y, low: 4.5, high: 5.9 },
          { sex: 'female', ageMinDays: 18 * Y, low: 4, high: 5.2 },
        ],
      },
      { key: 'wbc', name: 'WBC', unit: '×10⁹/L', ranges: [{ low: 4.5, high: 11 }], criticalLow: 2, criticalHigh: 30 },
      { key: 'plt', name: 'Platelets', unit: '×10⁹/L', ranges: [{ low: 150, high: 450 }], criticalLow: 50, criticalHigh: 1000 },
      { key: 'neut', name: 'Neutrophils', unit: '%', ranges: [{ low: 40, high: 70 }] },
      { key: 'lymph', name: 'Lymphocytes', unit: '%', ranges: [{ low: 20, high: 40 }] },
      { key: 'mono', name: 'Monocytes', unit: '%', ranges: [{ low: 2, high: 8 }] },
      { key: 'eos', name: 'Eosinophils', unit: '%', ranges: [{ low: 1, high: 4 }] },
      { key: 'baso', name: 'Basophils', unit: '%', ranges: [{ low: 0, high: 1 }] },
    ],
  },
  {
    code: 'UA',
    loinc: '24356-8',
    name: 'Urinalysis',
    section: 'Clinical microscopy',
    specimenType: 'Urine',
    turnaroundHours: 2,
    aliases: ['Urinalysis', 'UA', 'Routine urinalysis', 'Urine analysis', 'Urine routine'],
    analytes: [
      text('color', 'Color', 'Yellow'),
      text('transparency', 'Transparency', 'Clear'),
      { key: 'ph', name: 'pH', ranges: [{ low: 5, high: 8 }] },
      { key: 'sg', name: 'Specific gravity', ranges: [{ low: 1.005, high: 1.03 }] },
      text('protein', 'Protein', 'Negative'),
      text('glucose', 'Glucose', 'Negative'),
      { key: 'rbc', name: 'RBC', unit: '/hpf', ranges: [{ low: 0, high: 2 }] },
      { key: 'wbc', name: 'WBC (pus cells)', unit: '/hpf', ranges: [{ low: 0, high: 5 }] },
      text('epithelial', 'Epithelial cells', 'Few'),
      text('bacteria', 'Bacteria', 'Few'),
      text('casts', 'Casts', 'None'),
      text('crystals', 'Crystals', 'None'),
    ],
  },
  {
    code: 'FBS',
    loinc: '1558-6',
    name: 'Fasting blood sugar',
    section: 'Clinical chemistry',
    specimenType: 'Plasma (fluoride)',
    turnaroundHours: 2,
    aliases: ['FBS', 'Fasting blood sugar', 'Fasting blood glucose', 'Fasting glucose', 'FBG'],
    analytes: [{ key: 'glucose', name: 'Glucose, fasting', unit: 'mg/dL', ranges: [{ low: 70, high: 99 }], criticalLow: 40, criticalHigh: 450 }],
  },
  {
    code: 'LIPID',
    loinc: '57698-3',
    name: 'Lipid profile',
    section: 'Clinical chemistry',
    specimenType: 'Serum',
    turnaroundHours: 4,
    aliases: ['Lipid profile', 'Lipid panel', 'Lipids', 'Lipid test'],
    analytes: [
      { key: 'chol', name: 'Total cholesterol', unit: 'mg/dL', ranges: [{ high: 200 }] },
      { key: 'tg', name: 'Triglycerides', unit: 'mg/dL', ranges: [{ high: 150 }], criticalHigh: 1000 },
      {
        key: 'hdl',
        name: 'HDL',
        unit: 'mg/dL',
        ranges: [
          { sex: 'male', low: 40 },
          { sex: 'female', low: 50 },
        ],
      },
      { key: 'ldl', name: 'LDL', unit: 'mg/dL', ranges: [{ high: 100 }] },
      { key: 'vldl', name: 'VLDL', unit: 'mg/dL', ranges: [{ low: 2, high: 30 }] },
    ],
  },
  {
    code: 'CREA',
    loinc: '2160-0',
    name: 'Creatinine',
    section: 'Clinical chemistry',
    specimenType: 'Serum',
    turnaroundHours: 4,
    aliases: ['Creatinine', 'Crea', 'Serum creatinine'],
    analytes: [
      {
        key: 'crea',
        name: 'Creatinine',
        unit: 'mg/dL',
        ranges: [
          { sex: 'male', ageMinDays: 18 * Y, low: 0.74, high: 1.35 },
          { sex: 'female', ageMinDays: 18 * Y, low: 0.59, high: 1.04 },
        ],
        criticalHigh: 10,
      },
    ],
  },
];
