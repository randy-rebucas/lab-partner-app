// Local test accounts created by `pnpm e2e:fixtures`. Never used outside a local database.
export const E2E_PASSWORD = 'local test password 2026';
/** Base32 authenticator key shared by the test accounts (add it to any authenticator app to sign in by hand). */
export const E2E_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

export type E2EUser = { email: string; name: string; roles: string[]; licenceNo?: string };

export const E2E_USERS: E2EUser[] = [
  { email: 'admin@e2e.local', name: 'Andrea Admin', roles: ['admin'] },
  { email: 'desk@e2e.local', name: 'Dina Reyes', roles: ['front-desk'] },
  { email: 'phleb@e2e.local', name: 'Paolo Cruz', roles: ['phlebotomist'] },
  { email: 'medtech@e2e.local', name: 'Mara Santos', roles: ['medtech'], licenceNo: 'RMT-0045821' },
  { email: 'medtech2@e2e.local', name: 'Leo Garcia', roles: ['medtech'], licenceNo: 'RMT-0051190' },
  { email: 'path@e2e.local', name: 'Dr. Patricia Lim', roles: ['signatory', 'medtech'], licenceNo: 'PRC-0098123' },
];

export const byEmail = (email: string) => E2E_USERS.find((u) => u.email === email)!;
