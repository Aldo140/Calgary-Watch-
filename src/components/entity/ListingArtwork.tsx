import { useState } from 'react';
import type { EntityImage } from '../../types/discovery';

/** Original promotional posters retain their whole composition and credit. */
export function ListingArtwork({ image }: { image: EntityImage }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  if (failedSrc === image.src) return <p className="cw-listing-poster">Artwork is temporarily unavailable. Visit the official website for current programme information.</p>;
  return <figure className="cw-listing-poster">
    <img src={image.src} alt={image.alt} loading="lazy" decoding="async" onError={() => setFailedSrc(image.src)} />
    {image.credit ? <figcaption>{image.credit}</figcaption> : null}
  </figure>;
}
