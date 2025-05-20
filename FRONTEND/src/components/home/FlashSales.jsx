import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Clock, ArrowRight } from 'lucide-react';
import ProductCard from '../product/ProductCard';
import { onSaleProducts } from '../../data/products';
import { flashSalesBanner } from '../../data/banners';

function FlashSales() {
  const [timeLeft, setTimeLeft] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = flashSalesBanner.endTime - new Date();
      if (difference > 0) {
        setTimeLeft({
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / (1000 * 60)) % 60),
          seconds: Math.floor((difference / 1000) % 60)
        });
      }
    };

    // Calculate on component mount
    calculateTimeLeft();
    
    // Update every second
    const timer = setInterval(calculateTimeLeft, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const formatTimeUnit = (unit) => {
    return unit.toString().padStart(2, '0');
  };

  return (
    <section className="py-10">
      <div className="container-custom">
        {/* Header with countdown */}
        <div className="bg-gradient-to-r from-accent-600 to-accent-700 rounded-lg p-4 md:p-6 flex flex-col md:flex-row justify-between items-center mb-6">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-white mb-1">
              {flashSalesBanner.title}
            </h2>
            <p className="text-white text-opacity-90 text-sm md:text-base">
              {flashSalesBanner.subtitle}
            </p>
          </div>
          
          <div className="flex flex-col items-center mt-4 md:mt-0">
            <div className="flex items-center text-white mb-1">
              <Clock size={18} className="mr-2" />
              <span className="text-sm">Ends in:</span>
            </div>
            <div className="flex space-x-2">
              <div className="bg-white bg-opacity-20 rounded px-2 py-1 text-white">
                <span className="font-mono font-bold">{formatTimeUnit(timeLeft.hours)}</span>
                <span className="text-xs ml-1">h</span>
              </div>
              <div className="bg-white bg-opacity-20 rounded px-2 py-1 text-white">
                <span className="font-mono font-bold">{formatTimeUnit(timeLeft.minutes)}</span>
                <span className="text-xs ml-1">m</span>
              </div>
              <div className="bg-white bg-opacity-20 rounded px-2 py-1 text-white">
                <span className="font-mono font-bold">{formatTimeUnit(timeLeft.seconds)}</span>
                <span className="text-xs ml-1">s</span>
              </div>
            </div>
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-neutral-900">Hot Deals</h3>
          <Link 
            to="/sales" 
            className="text-primary-600 hover:text-primary-800 font-medium flex items-center transition-colors"
          >
            View All
            <ArrowRight size={16} className="ml-1" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {onSaleProducts.slice(0, 5).map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default FlashSales;