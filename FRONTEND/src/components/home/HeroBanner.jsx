import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { mainBanners } from '../../data/banners';

function HeroBanner() {
  const [currentSlide, setCurrentSlide] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % mainBanners.length);
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % mainBanners.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + mainBanners.length) % mainBanners.length);
  };

  const goToSlide = (index) => {
    setCurrentSlide(index);
  };

  return (
    <div className="relative h-[300px] md:h-[400px] lg:h-[500px] overflow-hidden">
      {/* Slides */}
      <div className="h-full">
        {mainBanners.map((banner, index) => (
          <div
            key={banner.id}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'
            }`}
          >
            <div className={`absolute inset-0 bg-gradient-to-r ${banner.bgColor} opacity-70`}></div>
            <img
              src={banner.imageUrl}
              alt={banner.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center">
              <div className="container-custom">
                <div className="max-w-lg px-4 md:px-0">
                  <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-2 md:mb-4">
                    {banner.title}
                  </h2>
                  <p className="text-white text-sm md:text-base lg:text-lg mb-4 md:mb-6">
                    {banner.subtitle}
                  </p>
                  <Link
                    to={banner.url}
                    className="inline-block bg-white text-primary-900 px-6 py-2 rounded-md font-medium hover:bg-neutral-100 transition-colors"
                  >
                    {banner.buttonText}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Buttons */}
      <button
        className="absolute left-4 top-1/2 transform -translate-y-1/2 z-20 bg-white bg-opacity-60 p-2 rounded-full hover:bg-opacity-90 transition-all text-neutral-800"
        onClick={prevSlide}
        aria-label="Previous slide"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 bg-white bg-opacity-60 p-2 rounded-full hover:bg-opacity-90 transition-all text-neutral-800"
        onClick={nextSlide}
        aria-label="Next slide"
      >
        <ChevronRight size={20} />
      </button>

      {/* Indicators */}
      <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center space-x-2">
        {mainBanners.map((_, index) => (
          <button
            key={index}
            className={`w-2 h-2 rounded-full transition-all focus:outline-none ${
              index === currentSlide
                ? 'bg-white w-6'
                : 'bg-white bg-opacity-60'
            }`}
            onClick={() => goToSlide(index)}
            aria-label={`Go to slide ${index + 1}`}
          ></button>
        ))}
      </div>
    </div>
  );
}

export default HeroBanner;