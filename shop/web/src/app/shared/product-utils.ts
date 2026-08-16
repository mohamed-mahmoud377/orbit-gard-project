import { Badge, ProductBase } from '../core/models';
import { placeholderDataUri } from './img-fallback.directive';

/** First usable image, or a generated placeholder if the catalog has none. */
export function primaryImage(product: Pick<ProductBase, 'images' | 'name'>): string {
  return product.images?.[0] ?? placeholderDataUri(product.name);
}

export interface BadgeStyle {
  label: string;
  classes: string;
}

const BADGE_STYLES: Record<Badge, BadgeStyle> = {
  BEST_SELLER: { label: 'Best seller', classes: 'bg-accent text-[#3a2200]' },
  NEW: { label: 'New', classes: 'bg-teal text-white' },
  DEAL: { label: 'Deal', classes: 'bg-pop text-white' },
  LIMITED: { label: 'Limited', classes: 'bg-ink text-white' },
};

export function badgeStyle(badge: Badge): BadgeStyle {
  return BADGE_STYLES[badge] ?? { label: badge, classes: 'bg-line text-body' };
}

/** "Only 3 left" / "In stock" / "Out of stock" plus the colour to say it in. */
export function stockLabel(stock: number): { text: string; tone: string } {
  if (stock <= 0) return { text: 'Out of stock', tone: 'text-pop' };
  if (stock <= 5) return { text: `Only ${stock} left`, tone: 'text-pop' };
  if (stock <= 20) return { text: `Low stock · ${stock} left`, tone: 'text-warn' };
  return { text: 'In stock', tone: 'text-teal' };
}

/**
 * A plausible delivery window. The API has no fulfilment model, so this is
 * derived deterministically from the product id — it must not flicker between
 * renders of the same product.
 */
export function deliveryEstimate(product: Pick<ProductBase, 'id' | 'freeShipping'>): {
  from: Date;
  to: Date;
} {
  let hash = 0;
  for (let i = 0; i < product.id.length; i++) hash = (hash * 31 + product.id.charCodeAt(i)) | 0;
  const base = product.freeShipping ? 2 : 3;
  const offset = Math.abs(hash) % 3;
  const from = new Date();
  from.setDate(from.getDate() + base + offset);
  const to = new Date(from);
  to.setDate(to.getDate() + 2);
  return { from, to };
}
