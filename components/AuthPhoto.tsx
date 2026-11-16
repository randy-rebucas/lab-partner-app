import { Photo } from '@/components/Photo';

/** The photo panel shared by sign-in and first-time setup. Hidden below 1024px, where the form is all that matters. */
export function AuthPhoto({ name, title, body }: { name: 'sign-in' | 'setup'; title: string; body: string }) {
  return (
    <div className="relative hidden h-full min-h-screen overflow-hidden bg-brand-navy lg:block">
      <Photo name={name} sizes="55vw" eager className="opacity-90" />
      {/* A solid navy plate under the words keeps them legible on any part of the photo. */}
      <div className="absolute inset-x-8 bottom-8 max-w-md rounded-lg bg-brand-navy/85 p-6 text-white backdrop-blur-sm">
        <p className="text-xl font-bold tracking-tight">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-white/80">{body}</p>
      </div>
    </div>
  );
}
