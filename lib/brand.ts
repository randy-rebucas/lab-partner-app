// Product naming in one place. The final product name is still an open question (docs/PLAN.md §11).
export const BRAND = {
  /** Wordmark, as in the MyClinicSoft console. */
  wordmark: 'MyClinicSoft',
  /** Line under the wordmark that names this product. */
  product: 'Lab',
  /** Used in <title> and metadata. */
  appName: 'MyClinicSoft Lab',
  description: 'Lab orders from MyClinicSoft clinics, from specimen to signed results.',
} as const;
