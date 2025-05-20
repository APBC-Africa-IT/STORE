export const products = [
  {
    id: 1,
    name: 'Premium Brake Pad Set',
    slug: 'premium-brake-pad-set',
    category: 'braking-system',
    subcategory: 'brake-pads',
    price: 89.99,
    originalPrice: 119.99,
    discount: 25,
    rating: 4.8,
    reviewCount: 124,
    stockStatus: 'in-stock',
    compatibleWith: ['Toyota', 'Honda', 'Nissan'],
    image: 'https://images.pexels.com/photos/4489749/pexels-photo-4489749.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    description: 'High-performance brake pads designed for optimal stopping power and durability. These premium ceramic pads provide excellent heat dissipation, reduced brake dust, and quieter operation.',
    features: [
      'Ceramic compound for superior performance',
      'Includes hardware and lubricant',
      'Low-dust formula keeps wheels cleaner',
      'Chamfered and slotted for noise reduction',
      'OEM-level fit and quality'
    ],
    specifications: {
      material: 'Ceramic',
      position: 'Front',
      warranty: '2-year limited warranty',
      includes: 'Set of 4 pads, hardware kit, lubricant'
    },
    relatedProducts: [2, 5, 8]
  },
  {
    id: 2,
    name: 'Performance Brake Disc Rotors (Pair)',
    slug: 'performance-brake-disc-rotors-pair',
    category: 'braking-system',
    subcategory: 'brake-discs',
    price: 134.99,
    originalPrice: 159.99,
    discount: 15,
    rating: 4.7,
    reviewCount: 89,
    stockStatus: 'in-stock',
    compatibleWith: ['Toyota', 'Honda', 'Mazda'],
    image: 'https://images.pexels.com/photos/3082341/pexels-photo-3082341.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    description: 'High-performance cross-drilled and slotted brake rotors designed for improved cooling and wet-weather performance. Precision-machined for balanced operation and reduced vibration.',
    features: [
      'Cross-drilled for improved cooling',
      'Slotted design for better wet braking',
      'Zinc coated to prevent rust',
      'Precision balanced to prevent vibration',
      'Direct OEM replacement'
    ],
    specifications: {
      material: 'High-carbon steel',
      position: 'Front',
      thickness: '28mm',
      warranty: '1-year limited warranty',
      includes: 'Pair of rotors'
    },
    relatedProducts: [1, 5, 8]
  },
  {
    id: 3,
    name: 'Engine Oil Filter - Premium',
    slug: 'engine-oil-filter-premium',
    category: 'filters',
    subcategory: 'oil-filters',
    price: 12.99,
    originalPrice: 16.99,
    discount: 23,
    rating: 4.9,
    reviewCount: 203,
    stockStatus: 'in-stock',
    compatibleWith: ['Most vehicles'],
    image: 'https://images.pexels.com/photos/4482900/pexels-photo-4482900.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    description: 'Premium quality oil filter with advanced filtration technology that removes more contaminants for better engine protection and longer engine life.',
    features: [
      'High-efficiency filtering media',
      'Silicone anti-drainback valve prevents dry starts',
      'Heavy-duty construction withstands high pressures',
      'Metal end caps for durability',
      'Compatible with conventional and synthetic oils'
    ],
    specifications: {
      type: 'Spin-on',
      filtration: '99% at 20 microns',
      warranty: 'Lifetime limited warranty',
      includes: '1 filter'
    },
    relatedProducts: [4, 14, 18]
  },
  {
    id: 4,
    name: 'High-Flow Air Filter',
    slug: 'high-flow-air-filter',
    category: 'filters',
    subcategory: 'air-filters',
    price: 29.99,
    originalPrice: 39.99,
    discount: 25,
    rating: 4.6,
    reviewCount: 176,
    stockStatus: 'limited',
    compatibleWith: ['Most vehicles with standard size air boxes'],
    image: 'https://images.pexels.com/photos/4483610/pexels-photo-4483610.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    description: 'Washable and reusable high-flow air filter designed to increase horsepower and acceleration. Provides excellent filtration while allowing more air into the engine.',
    features: [
      'Washable and reusable - no more disposable filters',
      'High-flow design increases horsepower',
      'Million mile limited warranty',
      'Eco-friendly and cost-effective',
      'Easy to clean and maintain'
    ],
    specifications: {
      material: 'Cotton gauze with wire mesh',
      warranty: 'Million mile limited warranty',
      reusable: 'Yes, washable up to 25 times',
      includes: '1 filter, cleaning instructions'
    },
    relatedProducts: [3, 14, 18]
  },
  {
    id: 5,
    name: 'Complete Brake Caliper Assembly',
    slug: 'complete-brake-caliper-assembly',
    category: 'braking-system',
    subcategory: 'calipers',
    price: 89.99,
    originalPrice: 119.99,
    discount: 25,
    rating: 4.5,
    reviewCount: 64,
    stockStatus: 'in-stock',
    compatibleWith: ['Toyota', 'Honda', 'Ford'],
    image: 'https://images.pexels.com/photos/5356262/pexels-photo-5356262.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    description: 'Brand new complete brake caliper assembly, not a rebuild. Includes brackets and hardware for a direct bolt-on installation. Premium quality for reliable braking performance.',
    features: [
      'Complete new unit, not remanufactured',
      'Includes mounting brackets and hardware',
      'Pressure tested for leak-free operation',
      'Premium internal components for long service life',
      'Powder-coated finish resists corrosion'
    ],
    specifications: {
      position: 'Front, Driver Side',
      material: 'Cast iron with aluminum pistons',
      warranty: '3-year limited warranty',
      includes: 'Caliper, bracket, hardware kit'
    },
    relatedProducts: [1, 2, 8]
  },
  {
    id: 6,
    name: 'Heavy-Duty Alternator',
    slug: 'heavy-duty-alternator',
    category: 'electrical',
    subcategory: 'alternators',
    price: 179.99,
    originalPrice: 229.99,
    discount: 22,
    rating: 4.7,
    reviewCount: 92,
    stockStatus: 'in-stock',
    compatibleWith: ['Chevrolet', 'GMC', 'Cadillac'],
    image: 'https://images.pexels.com/photos/3807329/pexels-photo-3807329.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    description: 'High-output alternator designed for vehicles with high electrical demands. Provides stable power output for aftermarket audio systems, additional lighting, and other electrical accessories.',
    features: [
      '220 Amp maximum output',
      'Heavy-duty cooling fan and oversized bearings',
      'Upgraded internal components for reliability',
      'Direct OEM replacement with no modifications required',
      'Designed for high electrical load applications'
    ],
    specifications: {
      output: '220 Amp',
      voltage: '12V',
      'mounting type': 'Direct fit',
      warranty: '3-year limited warranty',
      includes: 'Alternator only'
    },
    relatedProducts: [7, 12, 13]
  },
  {
    id: 7,
    name: 'High-Torque Starter Motor',
    slug: 'high-torque-starter-motor',
    category: 'electrical',
    subcategory: 'starters',
    price: 129.99,
    originalPrice: 159.99,
    discount: 19,
    rating: 4.6,
    reviewCount: 78,
    stockStatus: 'in-stock',
    compatibleWith: ['Ford', 'Lincoln', 'Mercury'],
    image: 'https://images.pexels.com/photos/4483608/pexels-photo-4483608.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    description: 'High-torque starter motor designed for faster, more reliable engine starting. Ideal for stock and modified engines with compression ratios up to 12:1.',
    features: [
      'High-torque design for faster starts',
      'Sealed against dust and moisture',
      'Heat-resistant solenoid for reliability',
      'Upgraded internal components for longer service life',
      'Lightweight design with full power output'
    ],
    specifications: {
      voltage: '12V',
      'gear reduction': 'Yes',
      rotation: 'Clockwise',
      warranty: '1-year limited warranty',
      includes: 'Starter motor only'
    },
    relatedProducts: [6, 12, 13]
  },
  {
    id: 8,
    name: 'Hydraulic Brake Master Cylinder',
    slug: 'hydraulic-brake-master-cylinder',
    category: 'braking-system',
    subcategory: 'master-cylinders',
    price: 69.99,
    originalPrice: 89.99,
    discount: 22,
    rating: 4.5,
    reviewCount: 56,
    stockStatus: 'limited',
    compatibleWith: ['Honda', 'Acura'],
    image: 'https://images.pexels.com/photos/4480546/pexels-photo-4480546.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    description: 'Premium hydraulic brake master cylinder engineered for reliable and consistent braking performance. Direct replacement for worn or leaking original equipment.',
    features: [
      'Precision-machined for proper fit and function',
      'Pressure tested for leak-free operation',
      'Meets or exceeds OEM specifications',
      'New components throughout, not rebuilt',
      'Bench bled for easier installation'
    ],
    specifications: {
      'bore size': '1.125 inch',
      material: 'Aluminum',
      reservoir: 'Included',
      warranty: '1-year limited warranty',
      includes: 'Master cylinder, reservoir, caps'
    },
    relatedProducts: [1, 2, 5]
  },
  {
    id: 9,
    name: 'Premium Ignition Coil Pack',
    slug: 'premium-ignition-coil-pack',
    category: 'electrical',
    subcategory: 'ignition',
    price: 49.99,
    originalPrice: 69.99,
    discount: 29,
    rating: 4.8,
    reviewCount: 112,
    stockStatus: 'in-stock',
    compatibleWith: ['Multiple vehicles'],
    image: 'https://images.pexels.com/photos/4481326/pexels-photo-4481326.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    description: 'High-performance ignition coil pack designed to restore lost power and improve fuel economy. Provides stronger spark for better combustion and smoother running engine.',
    features: [
      'High-energy output for stronger spark',
      'Improved fuel atomization and combustion',
      'Restores acceleration and power',
      'Direct fit replacement with no modifications',
      'Temperature and vibration resistant construction'
    ],
    specifications: {
      'voltage output': '45,000V',
      'connector type': 'Direct plug',
      warranty: '2-year limited warranty',
      includes: 'Single coil pack'
    },
    relatedProducts: [6, 7, 10]
  },
  {
    id: 10,
    name: 'Platinum Spark Plug Set',
    slug: 'platinum-spark-plug-set',
    category: 'electrical',
    subcategory: 'ignition',
    price: 29.99,
    originalPrice: 39.99,
    discount: 25,
    rating: 4.9,
    reviewCount: 189,
    stockStatus: 'in-stock',
    compatibleWith: ['Multiple vehicles'],
    image: 'https://images.pexels.com/photos/2244746/pexels-photo-2244746.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    description: 'Long-life platinum spark plugs designed for improved fuel economy and engine performance. Consistent spark and reduced electrode wear for reliable ignition.',
    features: [
      'Platinum tip for longer service life',
      'Improved throttle response and fuel economy',
      'Reduced electrode wear for consistent performance',
      'Pre-gapped for easy installation',
      'Meets or exceeds OEM specifications'
    ],
    specifications: {
      type: 'Platinum',
      gap: 'Pre-set to vehicle specification',
      warranty: 'Lifetime limited warranty',
      includes: 'Set of 4 spark plugs'
    },
    relatedProducts: [9, 6, 7]
  },
  {
    id: 11,
    name: 'Front Suspension Strut Assembly',
    slug: 'front-suspension-strut-assembly',
    category: 'suspension-steering',
    subcategory: 'shock-absorbers',
    price: 159.99,
    originalPrice: 199.99,
    discount: 20,
    rating: 4.7,
    reviewCount: 83,
    stockStatus: 'in-stock',
    compatibleWith: ['Toyota', 'Lexus'],
    image: 'https://images.pexels.com/photos/10801885/pexels-photo-10801885.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    description: 'Complete strut assembly including spring, bearing plate, and mounting hardware. Ready to install without spring compression for safer, easier replacement.',
    features: [
      'Complete assembly - no spring compressor needed',
      'OE-quality components for proper ride height',
      'Pre-assembled for faster installation',
      'Nitrogen gas-charged for consistent performance',
      'Rubber isolators reduce noise and vibration'
    ],
    specifications: {
      position: 'Front, Driver Side',
      type: 'Complete assembly',
      warranty: '3-year limited warranty',
      includes: 'Strut, spring, bearing plate, hardware'
    },
    relatedProducts: [15, 16, 17]
  },
  {
    id: 12,
    name: 'AGM Car Battery',
    slug: 'agm-car-battery',
    category: 'electrical',
    subcategory: 'batteries',
    price: 159.99,
    originalPrice: 189.99,
    discount: 16,
    rating: 4.8,
    reviewCount: 145,
    stockStatus: 'in-stock',
    compatibleWith: ['Multiple vehicles'],
    image: 'https://images.pexels.com/photos/1119775/pexels-photo-1119775.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    description: 'High-performance AGM (Absorbent Glass Mat) battery with superior cranking power and reserve capacity. Maintenance-free design with leak-proof construction for modern vehicles.',
    features: [
      'AGM technology for better power delivery',
      'Vibration resistant construction',
      'Zero maintenance design',
      'Higher reserve capacity than conventional batteries',
      'Enhanced starting power in cold weather'
    ],
    specifications: {
      voltage: '12V',
      CCA: '800',
      'reserve capacity': '120 minutes',
      warranty: '3-year full replacement',
      includes: 'Battery only'
    },
    relatedProducts: [6, 7, 13]
  }
];

export const getProductById = (id) => {
  return products.find(product => product.id === id);
};

export const getProductBySlug = (slug) => {
  return products.find(product => product.slug === slug);
};

export const getProductsByCategory = (categorySlug) => {
  return products.filter(product => product.category === categorySlug);
};

export const getProductsBySubcategory = (categorySlug, subcategorySlug) => {
  return products.filter(
    product => product.category === categorySlug && product.subcategory === subcategorySlug
  );
};

export const getRelatedProducts = (productId) => {
  const product = getProductById(productId);
  if (!product) return [];
  
  return product.relatedProducts.map(id => getProductById(id)).filter(Boolean);
};

export const searchProducts = (query, filters = {}) => {
  const { category, minPrice, maxPrice, sortBy } = filters;
  
  let results = products.filter(product => {
    // Search in name and description
    const matchesQuery = !query || 
      product.name.toLowerCase().includes(query.toLowerCase()) || 
      product.description.toLowerCase().includes(query.toLowerCase());
    
    // Filter by category
    const matchesCategory = !category || product.category === category;
    
    // Filter by price range
    const matchesMinPrice = !minPrice || product.price >= parseFloat(minPrice);
    const matchesMaxPrice = !maxPrice || product.price <= parseFloat(maxPrice);
    
    return matchesQuery && matchesCategory && matchesMinPrice && matchesMaxPrice;
  });
  
  // Sort results
  if (sortBy === 'price-low') {
    results.sort((a, b) => a.price - b.price);
  } else if (sortBy === 'price-high') {
    results.sort((a, b) => b.price - a.price);
  } else if (sortBy === 'rating') {
    results.sort((a, b) => b.rating - a.rating);
  } else if (sortBy === 'discount') {
    results.sort((a, b) => b.discount - a.discount);
  }
  
  return results;
};

export const featuredProducts = [1, 2, 6, 10, 12];
export const onSaleProducts = products.filter(product => product.discount >= 20);
export const popularProducts = products.filter(product => product.rating >= 4.7);