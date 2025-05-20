import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { categories } from '../../data/categories';
import CategoryIcon from '../ui/CategoryIcon';

function CategoryHighlights() {
  // Take just 6 categories for display
  const displayCategories = categories.slice(0, 6);

  return (
    <section className="py-10">
      <div className="container-custom">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-neutral-900">Popular Categories</h2>
          <Link 
            to="/all-categories" 
            className="text-primary-600 hover:text-primary-800 font-medium flex items-center transition-colors"
          >
            View All
            <ArrowRight size={16} className="ml-1" />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {displayCategories.map((category) => (
            <Link 
              key={category.id} 
              to={`/category/${category.slug}`}
              className="group"
            >
              <div className="bg-white rounded-lg shadow-sm hover:shadow-md p-4 flex flex-col items-center justify-center transition-all border border-neutral-100 hover:border-primary-200 h-full">
                <div className="w-16 h-16 md:w-20 md:h-20 flex items-center justify-center bg-primary-50 rounded-full mb-4 text-primary-600 group-hover:bg-primary-100 transition-colors">
                  <CategoryIcon name={category.icon} size={32} />
                </div>
                <h3 className="text-sm md:text-base font-medium text-neutral-800 text-center group-hover:text-primary-700 transition-colors">
                  {category.name}
                </h3>
                <span className="mt-2 text-xs text-neutral-500">
                  {category.subcategories.length} subcategories
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default CategoryHighlights;