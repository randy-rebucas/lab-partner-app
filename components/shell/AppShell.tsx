'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Building2,
  CalendarCheck,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  FlaskConical,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Microscope,
  Send,
  TestTubes,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { BRAND } from '@/lib/brand';
import { ROLE_INFO, isRole } from '@/lib/auth/roles';
import { SEGMENT_LABELS, isActive, type NavGroup, type NavIcon } from '@/lib/nav';
import { signOutAction } from '@/app/(auth)/login/actions';

const ICONS: Record<NavIcon, LucideIcon> = {
  today: LayoutDashboard,
  inbox: Inbox,
  'check-in': CalendarCheck,
  specimens: TestTubes,
  worklists: ListChecks,
  validation: ClipboardCheck,
  deliveries: Send,
  lab: Microscope,
  users: Users,
  catalog: FlaskConical,
  clinics: Building2,
};

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2';
const COLLAPSE_KEY = 'lp.sidebar.collapsed';

// The collapsed rail is a per-viewer convenience kept in localStorage.
const collapseListeners = new Set<() => void>();
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}
function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
  } catch {
    /* storage blocked: the toggle still works for this page view */
  }
  collapseListeners.forEach((l) => l());
}
function useCollapsed(): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      collapseListeners.add(cb);
      return () => collapseListeners.delete(cb);
    },
    readCollapsed,
    () => false
  );
  return [value, writeCollapsed];
}

export type ShellUser = { name: string; email: string; roles: string[] };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function roleLine(roles: string[]): string {
  return roles.filter(isRole).map((r) => ROLE_INFO[r].label).join(', ') || 'No role yet';
}

export function AppShell({ nav, user, children }: { nav: NavGroup[]; user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);
  const hideWhenCollapsed = collapsed ? 'lg:hidden' : '';

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-gray-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:ring-2 focus:ring-brand-teal">
        Skip to content
      </a>

      <div
        aria-hidden="true"
        onClick={closeMobile}
        className={`fixed inset-0 z-40 bg-brand-navy/40 transition-opacity duration-200 lg:hidden ${mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />

      <aside
        id="app-sidebar"
        className={`fixed left-0 top-0 z-50 h-screen w-[280px] border-r border-gray-200 bg-white transition-[width,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:z-40 ${
          collapsed ? 'lg:w-20' : 'lg:w-[280px]'
        } ${mobileOpen ? 'translate-x-0 shadow-[0_20px_50px_rgb(15,23,42,0.18)]' : '-translate-x-full'} lg:translate-x-0 lg:shadow-none`}
      >
        <div className="flex h-full flex-col">
          <div className={`flex h-16 items-center gap-2 border-b border-gray-200 ${collapsed ? 'px-4 lg:justify-center lg:px-0' : 'px-4'}`}>
            <Link href="/" onClick={closeMobile} aria-label={`${BRAND.appName}, Today`} className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-md ${collapsed ? 'lg:flex-none' : ''} ${FOCUS_RING}`}>
              <BrandLogo size={32} rounded="rounded-lg" />
              <span className={`min-w-0 leading-tight ${hideWhenCollapsed}`}>
                <span className="block truncate text-base font-bold tracking-tight text-gray-900">{BRAND.wordmark}</span>
                <span className="block text-xs text-gray-500">{BRAND.product}</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              aria-controls="app-sidebar"
              className={`hidden shrink-0 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 ${collapsed ? '' : 'lg:inline-flex'} ${FOCUS_RING}`}
            >
              <ChevronsLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button type="button" onClick={closeMobile} aria-label="Close navigation" className={`shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 lg:hidden ${FOCUS_RING}`}>
              <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          {collapsed && (
            <div className="hidden justify-center border-b border-gray-200 py-2 lg:flex">
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                aria-label="Expand sidebar"
                aria-controls="app-sidebar"
                className={`rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
              >
                <ChevronsRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          )}

          <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4">
            <div className="flex flex-col gap-5">
              {nav.map((group) => (
                <div key={group.label}>
                  <p className={`mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500 ${hideWhenCollapsed}`}>{group.label}</p>
                  {collapsed && <div className="mx-3 mb-2 hidden h-px bg-gray-200 lg:block" aria-hidden="true" />}
                  <ul className="flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const active = isActive(item.href, pathname);
                      const Icon = ICONS[item.icon];
                      return (
                        <li key={item.href} className="group relative">
                          <Link
                            href={item.href}
                            onClick={closeMobile}
                            aria-label={collapsed ? item.label : undefined}
                            aria-current={active ? 'page' : undefined}
                            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${collapsed ? 'lg:justify-center lg:px-0' : ''} ${
                              active ? 'bg-brand-teal-light font-semibold text-brand-teal-deep' : 'font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                            } ${FOCUS_RING}`}
                          >
                            <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-brand-teal-dark' : 'text-gray-500'}`} strokeWidth={1.75} aria-hidden="true" />
                            <span className={`truncate ${hideWhenCollapsed}`}>{item.label}</span>
                          </Link>
                          {collapsed && (
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white group-hover:lg:block"
                            >
                              {item.label}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        </div>
      </aside>

      <div className={`transition-[margin] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${collapsed ? 'lg:ml-20' : 'lg:ml-[280px]'}`}>
        <Header pathname={pathname} user={user} onMenu={() => setMobileOpen(true)} />
        <main id="main" tabIndex={-1} className="mx-auto max-w-7xl space-y-8 px-4 py-8 focus:outline-none sm:px-6 sm:py-10 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function Header({ pathname, user, onMenu }: { pathname: string; user: ShellUser; onMenu: () => void }) {
  const segments = pathname.split('/').filter(Boolean);
  return (
    <header className="no-print sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button type="button" onClick={onMenu} aria-label="Open navigation" aria-controls="app-sidebar" className={`-ml-1.5 shrink-0 rounded-md p-2 text-gray-700 hover:bg-gray-100 lg:hidden ${FOCUS_RING}`}>
            <Menu className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex min-w-0 items-center gap-1.5 text-sm">
              <li className="shrink-0">
                {segments.length === 0 ? (
                  <span className="font-semibold text-gray-900" aria-current="page">
                    Today
                  </span>
                ) : (
                  <Link href="/" className={`rounded font-medium text-gray-500 transition-colors hover:text-brand-teal-dark ${FOCUS_RING}`}>
                    Today
                  </Link>
                )}
              </li>
              {segments.map((seg, i) => {
                const href = '/' + segments.slice(0, i + 1).join('/');
                const last = i === segments.length - 1;
                const label = SEGMENT_LABELS[seg] ?? 'Details';
                return (
                  <li key={href} className={`flex min-w-0 items-center gap-1.5 ${last ? '' : 'hidden sm:flex'}`}>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" strokeWidth={1.75} aria-hidden="true" />
                    {last ? (
                      <span className="truncate font-semibold text-gray-900" aria-current="page">
                        {label}
                      </span>
                    ) : (
                      <Link href={href} className={`truncate rounded font-medium text-gray-500 transition-colors hover:text-brand-teal-dark ${FOCUS_RING}`}>
                        {label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
        <UserMenu user={user} />
      </div>
    </header>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const MENU_ITEM = `flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-3 rounded-md p-1 transition-colors hover:bg-gray-100 sm:pl-3 ${FOCUS_RING}`}
      >
        <span className="hidden text-right sm:block">
          <span className="block text-sm font-semibold leading-tight text-gray-900">{user.name}</span>
          <span className="mt-0.5 block text-xs leading-tight text-gray-500">{roleLine(user.roles)}</span>
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-teal-dark text-sm font-semibold text-white" aria-hidden="true">
          {initials(user.name)}
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_8px_30px_rgb(15,23,42,0.1)]">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">{user.email}</p>
          </div>
          <div className="p-1.5">
            <Link href="/login/password" role="menuitem" onClick={() => setOpen(false)} className={MENU_ITEM}>
              <KeyRound className="h-4 w-4 text-gray-500" strokeWidth={1.75} aria-hidden="true" />
              Change password
            </Link>
          </div>
          <form action={signOutAction} className="border-t border-gray-100 p-1.5">
            <button type="submit" role="menuitem" className={`${MENU_ITEM} hover:text-red-700`}>
              <LogOut className="h-4 w-4 text-gray-500" strokeWidth={1.75} aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
