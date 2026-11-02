// Vendored from the Pins app (Pins repo lib/pinsMapStyle.ts at 875d02b, palette from
// constants/designPalette.ts) so the public web map looks like Pins. Keep the two in sync when
// the app's map style changes. Only the import lines and the palette constant differ.
import type { FilterSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";

const designPalette = {
  ivory: "#FAF8F3",
  sand: "#E8DDCC",
  map: {
    land: "#EEEFE1", residential: "#ECECDE", park: "#DCE5CA", forest: "#D5E0C4", water: "#D4E5E7",
    road: "#FCFBF5", path: "#D1D7C4", building: "#E1E2D6", campus: "#E6E9DC", border: "#C8D0C2",
    label: "#7C8981", roadLabel: "#89938B", roadLabelMajor: "#78837B", anchorLabel: "#6F7C74",
    anchorIcon: "#8D9A90", poiLabel: "#858F88", poiIcon: "#A7AFA8",
  },
} as const;
const colors = designPalette.map;
const hiddenLayers = new Set(['Transit tunnel', 'Railway', 'Transit', 'Station labels', 'Other border']);

// Street names reveal by OpenMapTiles road class. Later layers win label
// collisions, so arterials stay readable when local detail gets dense.
const roadLabelTiers = [
  { id: 'Road labels service', minzoom: 16, classes: ['service', 'track', 'path'], size: [16, 9, 18, 10.5, 20, 12] },
  { id: 'Road labels', minzoom: 14.5, classes: ['minor'], size: [14.5, 9.5, 16, 10.5, 18, 12] },
  { id: 'Road labels tertiary', minzoom: 13, classes: ['tertiary'], size: [13, 9.5, 15, 10.5, 17, 12] },
  { id: 'Road labels major', minzoom: 12, classes: ['motorway', 'trunk', 'primary', 'secondary'], size: [12, 10, 14, 11, 16, 12, 18, 13] }
];

const inClass = (...values: string[]) => ['match', ['get', 'class'], values, true, false] as FilterSpecification;
const inSubclass = (...values: string[]) => ['match', ['get', 'subclass'], values, true, false] as FilterSpecification;
const not = (filter: FilterSpecification) => ['!', filter] as FilterSpecification;

// Basic v2 ships no POI layers; these read the same `poi` source layer as
// MapTiler Streets. The v3 tiles carry POIs from z14 (only stations and
// top-ranked campuses earlier), so tiers mostly control priority and density.
const poiTiers = [
  {
    id: 'POI anchors', minzoom: 13, anchor: true,
    match: ['any',
      inClass('college', 'stadium', 'theme_park', 'zoo', 'aquarium', 'park'),
      ['all', inClass('hospital'), inSubclass('hospital')],
      ['all', inClass('railway'), inSubclass('station', 'subway')],
      ['all', inClass('bus'), inSubclass('bus_station')],
      inSubclass('mall', 'department_store')
    ] as FilterSpecification
  },
  {
    id: 'POI neighborhood', minzoom: 14,
    match: ['any',
      inClass('grocery', 'pharmacy', 'cinema', 'theatre', 'library', 'museum', 'attraction', 'town_hall', 'sports_centre', 'fitness_centre'),
      ['all', inClass('school'), inSubclass('school')],
      ['all', inClass('lodging'), inSubclass('hotel', 'motel', 'hostel')],
      inSubclass('supermarket', 'doityourself', 'hardware', 'wholesale', 'fitness_centre')
    ] as FilterSpecification
  },
  {
    id: 'POI everyday', minzoom: 15,
    match: ['any',
      inClass('restaurant', 'fast_food', 'cafe', 'bar', 'beer', 'ice_cream', 'bakery', 'food_court', 'clothing_store',
        'alcohol_shop', 'shop', 'bank', 'hospital', 'place_of_worship', 'laundry', 'hairdresser', 'lodging'),
      ['all', inClass('fuel'), inSubclass('fuel')],
      ['all', inClass('post'), inSubclass('post_office')]
    ] as FilterSpecification
  },
  {
    // Everything else that is named, minus street furniture and transit stops.
    id: 'POI detail', minzoom: 16.5,
    match: not(['any',
      inClass('gate', 'lift_gate', 'bollard', 'waste_basket', 'drinking_water', 'bicycle_parking', 'motorcycle_parking',
        'toilets', 'shelter', 'bench', 'swimming_pool', 'information', 'bus', 'railway', 'aerialway', 'entrance', 'atm',
        'post', 'recycling', 'telephone'),
      inSubclass('artwork', 'parcel_locker', 'post_box', 'board', 'map', 'guidepost')
    ] as FilterSpecification)
  }
];

// Classes whose name matches a Basic v2 sprite icon (all SDF, so they take the muted tint).
const poiIcons = ['alcohol_shop', 'aquarium', 'art_gallery', 'attraction', 'bakery', 'bank', 'bar', 'beer', 'cafe',
  'campsite', 'car', 'castle', 'cinema', 'clothing_store', 'college', 'dentist', 'doctors', 'fast_food', 'fire_station',
  'fitness_centre', 'fuel', 'garden', 'golf', 'grocery', 'hairdresser', 'hospital', 'ice_cream', 'laundry', 'library',
  'lodging', 'monument', 'museum', 'music', 'park', 'parking', 'pharmacy', 'place_of_worship', 'playground', 'police',
  'post', 'railway', 'restaurant', 'school', 'shop', 'stadium', 'swimming', 'theatre', 'theme_park', 'town_hall',
  'veterinary', 'zoo'];

function poiLayers(source: string, font: unknown): { below: LayerSpecification[]; above: LayerSpecification[] } {
  const layers = poiTiers.map((tier, index): LayerSpecification => ({
    id: tier.id,
    type: 'symbol',
    source,
    'source-layer': 'poi',
    minzoom: tier.minzoom,
    // Each place belongs to exactly one tier, so no POI is drawn twice.
    filter: ['all', ['has', 'name'], tier.match, ...poiTiers.slice(0, index).map((earlier) => not(earlier.match))] as FilterSpecification,
    layout: {
      'icon-image': ['match', ['get', 'class'], poiIcons, ['get', 'class'], 'sports_centre', 'fitness_centre', 'dot'],
      'icon-size': tier.anchor ? 0.8 : 0.7,
      // The OSM name; tile `name:en` values for places are often machine-built.
      'text-field': ['get', 'name'],
      'text-font': font as string[],
      'text-size': ['interpolate', ['linear'], ['zoom'], 13, tier.anchor ? 10.5 : 10, 18, tier.anchor ? 13 : 12],
      'text-anchor': 'top',
      'text-offset': [0, 0.7],
      'text-max-width': 8,
      'text-padding': 3,
      // Lower rank is the tile's own importance order; anchors also rank by kind.
      'symbol-sort-key': tier.anchor
        ? ['+', ['match', ['get', 'class'], 'college', 0, 'hospital', 1000, 'railway', 2000, 'park', 5000, 3000], ['number', ['get', 'rank'], 999]]
        : ['number', ['get', 'rank'], 999]
    },
    paint: {
      'icon-color': tier.anchor ? colors.anchorIcon : colors.poiIcon,
      'text-color': tier.anchor ? colors.anchorLabel : colors.poiLabel,
      'text-halo-color': colors.land,
      'text-halo-width': 1.2
    }
  }));
  // Anchors outrank street names; everyday places yield to them.
  return { below: layers.slice(1).reverse(), above: layers.slice(0, 1) };
}

/** Visual adaptation of MapTiler Basic v2, preserving its sources and geometry. */
export function softenBasicMapStyle(style: StyleSpecification): StyleSpecification {
  if (style.version !== 8 || !style.sources || !Array.isArray(style.layers)
    || !['Background', 'Water', 'Road network'].every((id) => style.layers.some((layer) => layer.id === id))) {
    throw new Error('Unsupported Basic map style');
  }

  const soften = (layer: LayerSpecification): LayerSpecification => {
    if (hiddenLayers.has(layer.id)) {
      return { ...layer, layout: { ...layer.layout, visibility: 'none' } };
    }
    if (layer.type === 'background' && layer.id === 'Background') {
      return { ...layer, paint: { ...layer.paint, 'background-color': colors.land } };
    }
    if (layer.type === 'fill') {
      const fills: Record<string, string> = {
        Residential: colors.residential, Glacier: designPalette.ivory,
        Forest: colors.forest, Sand: designPalette.sand, Grass: colors.park,
        Wood: colors.forest, Water: colors.water, Bridge: colors.road,
        Pier: colors.road, Building: colors.building
      };
      if (!fills[layer.id]) return layer;
      if (layer.id === 'Building') {
        // Footprints fade in at street level to help place Pins on campuses and blocks.
        return {
          ...layer,
          minzoom: Math.max(14.5, layer.minzoom ?? 0),
          paint: { ...layer.paint, 'fill-color': fills[layer.id], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14.5, 0, 16, 1] }
        };
      }
      return { ...layer, paint: { ...layer.paint, 'fill-color': fills[layer.id] } };
    }
    if (layer.type === 'line') {
      const lines: Record<string, string> = {
        River: colors.water, 'River intermittent': colors.water,
        'Road network': colors.road, Path: colors.path, 'Path minor': colors.path,
        Aeroway: colors.building, 'Disputed border': colors.border, 'Country border': colors.border
      };
      return lines[layer.id] ? { ...layer, paint: { ...layer.paint, 'line-color': lines[layer.id] } } : layer;
    }
    if (layer.type === 'symbol' && ['Airport labels', 'Place labels', 'City labels', 'Country labels', 'Continent labels'].includes(layer.id)) {
      return {
        ...layer,
        paint: {
          ...layer.paint,
          'text-color': layer.id === 'Airport labels' ? colors.anchorLabel : colors.label,
          'text-halo-color': colors.land,
          'text-halo-width': 1
        }
      };
    }
    // Unexpected/new provider layers keep their original settings.
    return layer;
  };

  const layers = style.layers.flatMap((layer): LayerSpecification[] => {
    if (layer.id === 'Residential' && layer.type === 'fill') {
      return [soften(layer), {
        id: 'Campus',
        type: 'fill',
        source: layer.source,
        'source-layer': 'landuse',
        minzoom: 11,
        filter: inClass('university', 'college', 'school', 'hospital'),
        paint: { 'fill-color': colors.campus, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0, 12.5, 1] }
      }];
    }
    if (layer.id === 'Road labels' && layer.type === 'symbol') {
      const roadLabels = roadLabelTiers.map((tier): LayerSpecification => ({
        ...layer,
        id: tier.id,
        minzoom: tier.minzoom,
        filter: ['all', inClass(...tier.classes), ['!=', ['get', 'subclass'], 'junction']] as FilterSpecification,
        layout: { ...layer.layout, 'text-size': ['interpolate', ['linear'], ['zoom'], ...tier.size] as never },
        paint: {
          ...layer.paint,
          'text-color': tier.id === 'Road labels major' ? colors.roadLabelMajor : colors.roadLabel,
          'text-halo-color': colors.land,
          'text-halo-width': 1
        }
      }));
      const pois = poiLayers(layer.source, layer.layout?.['text-font'] ?? ['Noto Sans Regular']);
      return [...pois.below, ...roadLabels, ...pois.above];
    }
    return [soften(layer)];
  });

  // Style changes must not supply a competing initial camera position.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- website lint only; dropped on purpose
  const { center, zoom, bearing, pitch, ...base } = style;
  return { ...base, layers };
}

