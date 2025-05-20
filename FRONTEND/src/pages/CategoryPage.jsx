import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Filter, ChevronDown, ChevronUp, X } from 'lucide-react';
import { getProductsByCategory, getProductsBySubcategory } from '../data/products';
import { getCategoryBySlug, getSubcategoryBySlug } from '../data/categories';
import ProductCard from '../components/product/ProductCard';
import CategoryIcon from '../components/ui/CategoryIcon';

function CategoryPage() {
  const { slug, subSlug } = useParams();
  const category = getCategoryBySlug(slug);
  const subcategory = subSlug ? getSubcategoryBySlug(slug, subSlug) : null;
  
  const products = subSlug 
    ? getProductsBySubcategory(slug, subSlug)
    : getProductsByCategory(slug);
  
  const [filters, setFilters] = useState({
    priceRange: [0, 1000],
    sortBy: 'featured',
    showFilters: false
  });

  if (!category) {
    return (
      <div className="container-custom py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Category Not Found</h1>
        <p className="mb-8">The category you're looking for doesn't exist.</p>
        <Link to="/" className="btn btn-primary">
          Return to Home
        </Link>
      </div>
    );
  }

  const handleSortChange = (e) => {
    setFilters({ ...filters, sortBy: e.target.value });
  };

  const handlePriceChange = (e, index) => {
    const newPriceRange = [...filters.priceRange];
    newPriceRange[index] = parseInt(e.target.value);
    setFilters({ ...filters, priceRange: newPriceRange });
  };

  const toggleFilters = () => {
    setFilters({ ...filters, showFilters: !filters.showFilters });
  };

  return (
    <div className="bg-white">
      {/* Breadcrumb */}
      <div className="bg-neutral-100 py-3">
        <div className="container-custom">
          <div className="flex items-center text-sm">
            <Link to="/" className="text-neutral-600 hover:text-primary-600 transition-colors">Home</Link>
            <span className="mx-2 text-neutral-400">/</span>
            <Link to="/categories" className="text-neutral-600 hover:text-primary-600 transition-colors">Categories</Link>
            <span className="mx-2 text-neutral-400">/</span>
            <Link to={`/category/${category.slug}`} className="text-neutral-600 hover:text-primary-600 transition-colors">
              {category.name}
            </Link>
            {subcategory && (
              <>
                <span className="mx-2 text-neutral-400">/</span>
                <span className="text-neutral-900 font-medium">{subcategory.name}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Page Header */}
      <div className="bg-neutral-900 text-white py-12">
        <div className="container-custom">
          <div className="flex items-center">
            <div className="w-16 h-16 bg-white bg-opacity-10 rounded-full flex items-center justify-center mr-4">
              <CategoryIcon name={category.icon} size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-1">
                {subcategory ? subcategory.name : category.name}
              </h1>
              <p className="text-neutral-300">
                {products.length} products available
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Subcategories */}
      {!subcategory && category.subcategories && category.subcategories.length > 0 && (
        <div className="container-custom py-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {category.subcategories.map((sub) => (
              <Link 
                key={sub.id} 
                to={`/category/${category.slug}/${sub.slug}`}
                className="bg-white border border-neutral-200 rounded-lg p-4 text-center hover:border-primary-300 hover:shadow-md transition-all group"
              >
                <span className="block font-medium text-neutral-800 group-hover:text-primary-600 transition-colors">
                  {sub.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Content Area with Filters and Products */}
      <div className="container-custom py-8">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Mobile Filter Toggle */}
          <div className="md:hidden mb-4">
            <button
              onClick={toggleFilters}
              className="w-full flex items-center justify-between bg-white border border-neutral-300 rounded-md p-3 text-neutral-700"
            >
              <span className="flex items-center">
                <Filter size={18} className="mr-2" />
                Filters
              </span>
              {filters.showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>

          {/* Filters Sidebar */}
          <div className={`md:w-1/4 lg:w-1/5 ${filters.showFilters ? 'block' : 'hidden md:block'}`}>
            <div className="bg-white border border-neutral-200 rounded-lg p-4 sticky top-24">
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-neutral-900">Price Range</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-500">Min Price:</span>
                    <span className="text-sm font-medium">${filters.priceRange[0]}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    step="5"
                    value={filters.priceRange[0]}
                    onChange={(e) => handlePriceChange(e, 0)}
                    className="w-full"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-500">Max Price:</span>
                    <span className="text-sm font-medium">${filters.priceRange[1]}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    step="5"
                    value={filters.priceRange[1]}
                    onChange={(e) => handlePriceChange(e, 1)}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-medium text-neutral-900 mb-3">Brand</h3>
                <div className="space-y-2">
                  {['Bosch', 'NGK', 'Denso', 'Brembo', 'Monroe'].map((brand) => (
                    <div key={brand} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`brand-${brand}`}
                        className="mr-2"
                      />
                      <label htmlFor={`brand-${brand}`} className="text-neutral-600 text-sm">
                        {brand}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-medium text-neutral-900 mb-3">Condition</h3>
                <div className="space-y-2">
                  {['New', 'Remanufactured', 'Used'].map((condition) => (
                    <div key={condition} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`condition-${condition}`}
                        className="mr-2"
                      />
                      <label htmlFor={`condition-${condition}`} className="text-neutral-600 text-sm">
                        {condition}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <button className="w-full py-2 border border-neutral-300 rounded-md text-neutral-700 hover:bg-neutral-50 transition-colors">
                Apply Filters
              </button>
            </div>
          </div>

          {/* Product Grid */}
          <div className="md:w-3/4 lg:w-4/5">
            {/* Sort Options */}
            <div className="flex items-center justify-between mb-6 bg-white border border-neutral-200 rounded-lg p-3">
              <span className="text-neutral-600 text-sm hidden sm:inline">
                Showing {products.length} results
              </span>
              <div className="flex items-center ml-auto">
                <label htmlFor="sort" className="text-sm text-neutral-600 mr-2">
                  Sort by:
                </label>
                <select
                  id="sort"
                  value={filters.sortBy}
                  onChange={handleSortChange}
                  className="border border-neutral-300 rounded-md p-1.5 text-sm"
                >
                  <option value="featured">Featured</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="newest">Newest</option>
                  <option value="rating">Top Rated</option>
                </select>
              </div>
            </div>

            {/* Products */}
            {products.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {products.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white border border-neutral-200 rounded-lg">
                <p className="text-neutral-600 mb-4">No products found in this category.</p>
                <Link to="/" className="btn btn-primary">
                  Continue Shopping
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CategoryPage;