import { AppShell } from '@/components/shell/AppShell';
import { requireUser } from '@/lib/auth/guards';
import { navFor } from '@/lib/nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell nav={navFor(user.roles)} user={{ name: user.name, email: user.email, roles: user.roles }}>
      {children}
    </AppShell>
  );
}
