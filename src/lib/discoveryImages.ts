import type { EntityImage } from '../types/discovery';

/**
 * Repository-wide editorial art is not documentary evidence of an entity.
 * Keep it decorative when it is reused on a listing; provider/entity images
 * retain their reviewed alt text.
 */
export function entityImageAlt(image?: EntityImage): string {
  if (!image) return '';
  const src = image.src.toLowerCase();
  const sharedEditorialAsset = src.startsWith('/images/illustration/')
    || src.startsWith('/images/quadrant/')
    || /^\/images\/photo\/calgary\d+\.(webp|png|jpe?g)$/.test(src)
    || src.startsWith('/images/hero/calgarywatch-');
  return sharedEditorialAsset ? '' : image.alt;
}
