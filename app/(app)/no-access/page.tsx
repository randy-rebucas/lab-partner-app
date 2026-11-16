import { ShieldX } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, Panel } from '@/components/ui/Panel';

export const metadata = { title: 'No access' };

export default function NoAccessPage() {
  return (
    <Panel>
      <EmptyState
        icon={<ShieldX className="h-5 w-5" strokeWidth={1.75} />}
        title="Your role can't open that page"
        hint="Ask your lab admin if you need it for your work."
        action={
          <ButtonLink href="/" variant="secondary" size="sm">
            Go to Today
          </ButtonLink>
        }
      />
    </Panel>
  );
}
