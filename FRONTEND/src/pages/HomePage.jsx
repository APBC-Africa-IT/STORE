import React from 'react';
import HeroBanner from '../components/home/HeroBanner';
import VehicleSelector from '../components/home/VehicleSelector';
import CategoryHighlights from '../components/home/CategoryHighlights';
import FeaturedProducts from '../components/home/FeaturedProducts';
import FlashSales from '../components/home/FlashSales';
import ServiceBanners from '../components/home/ServiceBanners';

function HomePage() {
  return (
    <div>
      <HeroBanner />
      <VehicleSelector />
      <CategoryHighlights />
      <FeaturedProducts />
      <FlashSales />
      <ServiceBanners />
    </div>
  );
}

export default HomePage;