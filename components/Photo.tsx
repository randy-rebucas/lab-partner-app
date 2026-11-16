import Image from 'next/image';
import { sectionSlug } from '@/lib/tat';

// Stock photos (public/photos, credits in public/photos/CREDITS.md). Photos set the scene only:
// they never carry information, so every one is decorative (empty alt) unless a caption says otherwise.
export const PHOTOS = {
  'sign-in': { w: 960, h: 1280 },
  setup: { w: 960, h: 1280 },
  today: { w: 1200, h: 600 },
  verify: { w: 1200, h: 400 },
  hematology: { w: 720, h: 360 },
  'clinical-microscopy': { w: 720, h: 360 },
  'clinical-chemistry': { w: 720, h: 360 },
  'immunology-and-serology': { w: 720, h: 360 },
  microbiology: { w: 720, h: 360 },
  other: { w: 720, h: 360 },
} as const;

export type PhotoName = keyof typeof PHOTOS;

/** The photo for a catalog section, by its slug; "other" when a section has none of its own. */
export function sectionPhoto(section: string): PhotoName {
  const slug = sectionSlug(section);
  return slug in PHOTOS ? (slug as PhotoName) : 'other';
}

/** Fills its (relative, sized) parent and crops to it. */
export function Photo({ name, sizes, eager = false, className = '' }: { name: PhotoName; sizes: string; eager?: boolean; className?: string }) {
  return <Image src={`/photos/${name}.jpg`} alt="" fill sizes={sizes} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} className={`object-cover ${className}`} />;
}
