// The five roles in the lab (BUILD_PROMPT.md "Users and roles"). A user can hold several.
export const ROLES = ['admin', 'front-desk', 'phlebotomist', 'medtech', 'signatory'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  admin: { label: 'Lab admin', description: 'Sets up the lab, users, test catalog, connected clinics and API keys.' },
  'front-desk': { label: 'Front desk', description: 'Checks patients in, scans slips, prints barcodes and reports.' },
  phlebotomist: { label: 'Phlebotomist', description: 'Collects and labels specimens and records collection time.' },
  medtech: { label: 'Medical technologist', description: 'Runs tests, enters results and submits them for validation.' },
  signatory: { label: 'Pathologist / signatory', description: 'Validates, releases and amends results, and signs reports.' },
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function hasAnyRole(userRoles: readonly string[], allowed: readonly Role[]): boolean {
  return allowed.some((r) => userRoles.includes(r));
}

/** Who may do each kind of work. Pages and actions check these; the sidebar mirrors them. */
export const CAN = {
  decideOrders: ['admin', 'front-desk', 'medtech'],
  checkIn: ['admin', 'front-desk', 'phlebotomist'],
  collect: ['admin', 'phlebotomist', 'medtech'],
  rejectSpecimen: ['admin', 'phlebotomist', 'medtech'],
  seeSpecimens: ['admin', 'front-desk', 'phlebotomist', 'medtech'],
} as const satisfies Record<string, readonly Role[]>;
