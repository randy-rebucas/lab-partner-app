import { hasAnyRole, type Role } from '@/lib/auth/roles';

// The sidebar, in groups. Each item lists the roles that may open it; the page enforces the same
// roles with requireUser(), so hiding an item is a convenience, never the security check.
export type NavIcon =
  | 'today'
  | 'inbox'
  | 'check-in'
  | 'specimens'
  | 'worklists'
  | 'validation'
  | 'deliveries'
  | 'lab'
  | 'users'
  | 'catalog'
  | 'clinics';

export type NavItem = { href: string; label: string; icon: NavIcon; roles: readonly Role[] };
export type NavGroup = { label: string; items: NavItem[] };

const ALL: readonly Role[] = ['admin', 'front-desk', 'phlebotomist', 'medtech', 'signatory'];

export const NAV: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { href: '/', label: 'Today', icon: 'today', roles: ALL },
      { href: '/orders', label: 'Order inbox', icon: 'inbox', roles: ['admin', 'front-desk', 'medtech', 'signatory'] },
      { href: '/check-in', label: 'Check-in', icon: 'check-in', roles: ['admin', 'front-desk', 'phlebotomist'] },
      { href: '/specimens', label: 'Specimens', icon: 'specimens', roles: ['admin', 'front-desk', 'phlebotomist', 'medtech'] },
      { href: '/worklists', label: 'Worklists', icon: 'worklists', roles: ['admin', 'medtech', 'signatory'] },
      { href: '/validation', label: 'Validation', icon: 'validation', roles: ['admin', 'signatory'] },
      { href: '/deliveries', label: 'Deliveries', icon: 'deliveries', roles: ['admin', 'front-desk', 'signatory'] },
    ],
  },
  {
    label: 'Lab setup',
    items: [
      { href: '/admin/lab', label: 'Lab profile', icon: 'lab', roles: ['admin'] },
      { href: '/admin/users', label: 'Users', icon: 'users', roles: ['admin'] },
      { href: '/admin/catalog', label: 'Test catalog', icon: 'catalog', roles: ['admin'] },
      { href: '/admin/clinics', label: 'Connected clinics', icon: 'clinics', roles: ['admin'] },
    ],
  },
];

/** The groups and items this user may see; empty groups are dropped. */
export function navFor(roles: readonly string[]): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => hasAnyRole(roles, i.roles)) })).filter((g) => g.items.length);
}

/** Breadcrumb labels for path segments. Unknown segments (ids) are shown as "Details". */
export const SEGMENT_LABELS: Record<string, string> = {
  orders: 'Order inbox',
  'check-in': 'Check-in',
  specimens: 'Specimens',
  worklists: 'Worklists',
  validation: 'Validation',
  deliveries: 'Deliveries',
  results: 'Results',
  reports: 'Report',
  admin: 'Lab setup',
  lab: 'Lab profile',
  users: 'Users',
  catalog: 'Test catalog',
  clinics: 'Connected clinics',
  mappings: 'Test names',
  new: 'New',
  'no-access': 'No access',
};

export function isActive(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
