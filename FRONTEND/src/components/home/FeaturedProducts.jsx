import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import ProductCard from '../product/ProductCard';
import { products, featuredProducts } from '../../data/products';

function FeaturedProducts() {
  const featuredProductsData = featuredProducts.map(id => products.find(p => p.id === id)).filter(Boolean);

  return (
    <section className="py-10 bg-neutral-50">
      <div className="container-custom">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-neutral-900">Featured Products</h2>
          <Link 
            to="/featured" 
            className="text-primary-600 hover:text-primary-800 font-medium flex items-center transition-colors"
          >
            View All
            <ArrowRight size={16} className="ml-1" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {featuredProductsData.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default FeaturedProducts;