export const categories = [
  {
    id: 1,
    name: 'Engine Parts',
    slug: 'engine-parts',
    icon: 'engine',
    subcategories: [
      { id: 101, name: 'Pistons & Rings', slug: 'pistons-rings' },
      { id: 102, name: 'Camshafts', slug: 'camshafts' },
      { id: 103, name: 'Gaskets', slug: 'gaskets' },
      { id: 104, name: 'Valves', slug: 'valves' },
      { id: 105, name: 'Timing Chains', slug: 'timing-chains' },
    ],
  },
  {
    id: 2,
    name: 'Braking System',
    slug: 'braking-system',
    icon: 'disc',
    subcategories: [
      { id: 201, name: 'Brake Pads', slug: 'brake-pads' },
      { id: 202, name: 'Brake Discs', slug: 'brake-discs' },
      { id: 203, name: 'Calipers', slug: 'calipers' },
      { id: 204, name: 'Brake Fluid', slug: 'brake-fluid' },
    ],
  },
  {
    id: 3,
    name: 'Transmission',
    slug: 'transmission',
    icon: 'settings',
    subcategories: [
      { id: 301, name: 'Clutch Kits', slug: 'clutch-kits' },
      { id: 302, name: 'Gearboxes', slug: 'gearboxes' },
      { id: 303, name: 'Flywheel', slug: 'flywheel' },
    ],
  },
  {
    id: 4,
    name: 'Suspension & Steering',
    slug: 'suspension-steering',
    icon: 'steering',
    subcategories: [
      { id: 401, name: 'Shock Absorbers', slug: 'shock-absorbers' },
      { id: 402, name: 'Springs', slug: 'springs' },
      { id: 403, name: 'Control Arms', slug: 'control-arms' },
      { id: 404, name: 'Steering Racks', slug: 'steering-racks' },
    ],
  },
  {
    id: 5,
    name: 'Electrical',
    slug: 'electrical',
    icon: 'zap',
    subcategories: [
      { id: 501, name: 'Batteries', slug: 'batteries' },
      { id: 502, name: 'Alternators', slug: 'alternators' },
      { id: 503, name: 'Starters', slug: 'starters' },
      { id: 504, name: 'Sensors', slug: 'sensors' },
      { id: 505, name: 'Lighting', slug: 'lighting' },
    ],
  },
  {
    id: 6,
    name: 'Cooling & Heating',
    slug: 'cooling-heating',
    icon: 'thermometer',
    subcategories: [
      { id: 601, name: 'Radiators', slug: 'radiators' },
      { id: 602, name: 'Water Pumps', slug: 'water-pumps' },
      { id: 603, name: 'Thermostats', slug: 'thermostats' },
      { id: 604, name: 'Fans', slug: 'fans' },
    ],
  },
  {
    id: 7,
    name: 'Filters',
    slug: 'filters',
    icon: 'filter',
    subcategories: [
      { id: 701, name: 'Oil Filters', slug: 'oil-filters' },
      { id: 702, name: 'Air Filters', slug: 'air-filters' },
      { id: 703, name: 'Fuel Filters', slug: 'fuel-filters' },
      { id: 704, name: 'Cabin Filters', slug: 'cabin-filters' },
    ],
  },
  {
    id: 8,
    name: 'Body Parts',
    slug: 'body-parts',
    icon: 'car',
    subcategories: [
      { id: 801, name: 'Bumpers', slug: 'bumpers' },
      { id: 802, name: 'Mirrors', slug: 'mirrors' },
      { id: 803, name: 'Doors', slug: 'doors' },
      { id: 804, name: 'Hoods', slug: 'hoods' },
    ],
  },
  {
    id: 9,
    name: 'Tools & Equipment',
    slug: 'tools-equipment',
    icon: 'tool',
    subcategories: [
      { id: 901, name: 'Hand Tools', slug: 'hand-tools' },
      { id: 902, name: 'Power Tools', slug: 'power-tools' },
      { id: 903, name: 'Diagnostic Tools', slug: 'diagnostic-tools' },
    ],
  },
];

export const getCategoryBySlug = (slug) => {
  return categories.find(category => category.slug === slug);
};

export const getSubcategoryBySlug = (categorySlug, subcategorySlug) => {
  const category = getCategoryBySlug(categorySlug);
  if (!category) return null;
  
  return category.subcategories.find(subcategory => subcategory.slug === subcategorySlug);
};