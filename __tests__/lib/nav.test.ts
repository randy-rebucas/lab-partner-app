import { describe, expect, it } from 'vitest';
import { isActive, navFor } from '@/lib/nav';

const hrefs = (roles: string[]) => navFor(roles).flatMap((g) => g.items.map((i) => i.href));

describe('navigation by role', () => {
  it('shows lab setup only to admins', () => {
    expect(hrefs(['admin'])).toContain('/admin/users');
    expect(hrefs(['medtech'])).not.toContain('/admin/users');
    expect(navFor(['medtech']).map((g) => g.label)).toEqual(['Work']);
  });

  it('shows validation only to signatories and admins', () => {
    expect(hrefs(['signatory'])).toContain('/validation');
    expect(hrefs(['medtech'])).not.toContain('/validation');
    expect(hrefs(['front-desk'])).not.toContain('/validation');
  });

  it('combines roles', () => {
    const both = hrefs(['phlebotomist', 'medtech']);
    expect(both).toContain('/check-in');
    expect(both).toContain('/worklists');
  });

  it('always offers Today', () => {
    expect(hrefs(['phlebotomist'])).toContain('/');
    expect(hrefs([])).toEqual([]);
  });
});

describe('active nav row', () => {
  it('matches Today only on the root', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/', '/orders')).toBe(false);
  });
  it('matches a section and its sub-pages, not look-alike paths', () => {
    expect(isActive('/orders', '/orders/abc')).toBe(true);
    expect(isActive('/orders', '/orders-archive')).toBe(false);
  });
});
