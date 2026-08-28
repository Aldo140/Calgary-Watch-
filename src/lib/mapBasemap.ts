import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

export const OPENFREEMAP_POSITRON_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

const UNNECESSARY_POI_LAYER = /(^|[-_])(poi|shop|restaurant|cafe|bar|tourism|attraction)([-_]|$)/i;

/**
 * Tune OpenFreeMap Positron into a quieter Calgary Watch canvas.
 *
 * The incident layer owns attention. The basemap keeps enough park, river,
 * road and neighbourhood information for orientation without competing with
 * markers or severity colours. A new object is returned so the provider's
 * fetched style is never mutated in place.
 */
export function createCalgaryWatchPositronStyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers
    .filter((layer) => !UNNECESSARY_POI_LAYER.test(layer.id))
    .map((layer): LayerSpecification => {
      const next = {
        ...layer,
        ...(layer.paint ? { paint: { ...layer.paint } } : {}),
        ...(layer.layout ? { layout: { ...layer.layout } } : {}),
      } as LayerSpecification;

      const paint = next.paint as Record<string, unknown> | undefined;
      const layout = next.layout as Record<string, unknown> | undefined;

      switch (next.id) {
        case 'background':
          if (paint) paint['background-color'] = '#F3F5F2';
          break;
        case 'park':
          if (paint) paint['fill-color'] = '#DDE9DD';
          break;
        case 'landcover_wood':
          if (paint) paint['fill-color'] = '#D4E2D5';
          break;
        case 'landuse_residential':
          if (paint) paint['fill-color'] = '#EDEFEA';
          break;
        case 'water':
          if (paint) paint['fill-color'] = '#C8DDE8';
          break;
        case 'waterway':
          if (paint) paint['line-color'] = '#B7D1DF';
          break;
        case 'building':
          if (paint) {
            paint['fill-color'] = '#E5E8E4';
            paint['fill-outline-color'] = '#D5DAD6';
          }
          break;
        case 'label_other':
          if (layout) {
            layout['text-font'] = ['Noto Sans Regular'];
            layout['text-letter-spacing'] = 0.04;
            layout['text-size'] = ['interpolate', ['linear'], ['zoom'], 9, 10, 12, 12, 15, 13];
            layout['text-transform'] = 'none';
          }
          if (paint) {
            paint['text-color'] = '#40566B';
            paint['text-halo-color'] = 'rgba(247,249,246,0.94)';
            paint['text-halo-width'] = 1.25;
          }
          break;
      }

      return next;
    });

  const sources = Object.fromEntries(
    Object.entries(style.sources).map(([id, source]) => [
      id,
      {
        ...source,
        attribution: 'OpenFreeMap © OpenMapTiles · Data © OpenStreetMap contributors',
      },
    ]),
  ) as StyleSpecification['sources'];

  return { ...style, sources, layers };
}
