export const mainBanners = [
  {
    id: 1,
    imageUrl: 'https://images.pexels.com/photos/188777/pexels-photo-188777.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    title: 'Premium Brake Components',
    subtitle: 'Up to 30% off on brake pads, rotors, and calipers',
    buttonText: 'Shop Now',
    url: '/category/braking-system',
    bgColor: 'from-primary-900 to-primary-800'
  },
  {
    id: 2,
    imageUrl: 'https://images.pexels.com/photos/4483608/pexels-photo-4483608.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    title: 'Electrical Components Sale',
    subtitle: 'Get up to 25% off starters, alternators, and batteries',
    buttonText: 'View Deals',
    url: '/category/electrical',
    bgColor: 'from-neutral-900 to-neutral-800'
  },
  {
    id: 3,
    imageUrl: 'https://images.pexels.com/photos/4481326/pexels-photo-4481326.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    title: 'Engine Performance Parts',
    subtitle: 'Upgrade your engine with premium components',
    buttonText: 'Explore',
    url: '/category/engine-parts',
    bgColor: 'from-accent-900 to-accent-800'
  }
];

export const promotionalBanners = [
  {
    id: 1,
    imageUrl: 'https://images.pexels.com/photos/9814218/pexels-photo-9814218.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    title: 'Free Shipping',
    subtitle: 'On orders over $99',
    url: '/shipping-policy',
    bgColor: 'bg-primary-100'
  },
  {
    id: 2,
    imageUrl: 'https://images.pexels.com/photos/5473177/pexels-photo-5473177.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    title: 'Warranty Guaranteed',
    subtitle: 'On all parts and accessories',
    url: '/warranty-info',
    bgColor: 'bg-accent-100'
  },
  {
    id: 3,
    imageUrl: 'https://images.pexels.com/photos/3822843/pexels-photo-3822843.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    title: 'Expert Support',
    subtitle: '24/7 technical assistance',
    url: '/support',
    bgColor: 'bg-neutral-100'
  }
];

export const flashSalesBanner = {
  id: 1,
  title: 'Flash Sale',
  subtitle: 'Limited time offers on premium parts',
  endTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
  bgColor: 'from-accent-600 to-accent-700'
};