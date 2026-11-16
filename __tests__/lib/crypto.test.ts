import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, randomToken, safeEqual, sha256 } from '@/lib/crypto';
import { passwordProblem } from '@/lib/auth/password';

describe('secret encryption', () => {
  it('round-trips and never stores the plain text', () => {
    const stored = encryptSecret('whsec_abc123');
    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain('whsec_abc123');
    expect(decryptSecret(stored)).toBe('whsec_abc123');
  });

  it('uses a fresh IV each time', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('rejects a tampered value', () => {
    const [v, iv, tag, data] = encryptSecret('secret').split('.');
    const flipped = data.slice(0, -1) + (data.endsWith('A') ? 'B' : 'A');
    expect(() => decryptSecret([v, iv, tag, flipped].join('.'))).toThrow();
  });
});

describe('helpers', () => {
  it('hashes with SHA-256 hex', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('makes URL-safe tokens of the requested strength', () => {
    expect(randomToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it('compares in constant time and handles unequal lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('password rules', () => {
  it('needs at least 12 characters', () => {
    expect(passwordProblem('short')).toMatch(/12 characters/);
    expect(passwordProblem('a long enough sentence')).toBeNull();
  });
  it('refuses the email name inside the password', () => {
    expect(passwordProblem('maria.santos-2026!', 'maria.santos@lab.ph')).toMatch(/email name/);
  });
  it('refuses one repeated character', () => {
    expect(passwordProblem('aaaaaaaaaaaaaa')).toMatch(/repeat/);
  });
});
