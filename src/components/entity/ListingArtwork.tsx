import type { EntityImage } from '../../types/discovery';

/** Original promotional posters retain their whole composition and credit. */
export function ListingArtwork({ image }: { image: EntityImage }) {
  return <figure className="cw-listing-poster">
    <img src={image.src} alt={image.alt} loading="lazy" decoding="async" />
    {image.credit ? <figcaption>{image.credit}</figcaption> : null}
  </figure>;
}
