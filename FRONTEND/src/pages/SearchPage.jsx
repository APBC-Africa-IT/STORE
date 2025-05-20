import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Filter, ChevronDown, ChevronUp, Search as SearchIcon } from 'lucide-react';
import { searchProducts } from '../data/products';
import { categories } from '../data/categories';
import ProductCard from '../components/product/ProductCard';
import { useSearch } from '../context/SearchContext';

function SearchPage() {
  const location = useLocation();
  const { searchTerm, isLoading, searchParams, updateFilters } = useSearch();
  const [showFilters, setShowFilters] = useState(false);
  const [results, setResults] = useState([]);
  const [sortBy, setSortBy] = useState('relevance');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [priceRange, setPriceRange] = useState([0, 1000]);

  useEffect(() => {
    const query = new URLSearchParams(location.search).get('q') || searchTerm;
    
    const filters = {
      category: selectedCategory,
      minPrice: priceRange[0],
      maxPrice: priceRange[1],
      sortBy: sortBy
    };
    
    setResults(searchProducts(query, filters));
  }, [location.search, searchTerm, selectedCategory, priceRange, sortBy]);

  const handleSortChange = (e) => {
    setSortBy(e.target.value);
  };

  const handleCategoryChange = (e) => {
    setSelectedCategory(e.target.value);
  };

  const handlePriceChange = (index, value) => {
    const newPriceRange = [...priceRange];
    newPriceRange[index] = parseInt(value);
    setPriceRange(newPriceRange);
  };

  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };

  const query = new URLSearchParams(location.search).get('q') || searchTerm;

  return (
    <div className="bg-white">
      <div className="bg-neutral-900 py-12">
        <div className="container-custom">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-6">Search Results</h1>
          
          <div className="relative max-w-xl">
            <input
              type="text"
              defaultValue={query}
              placeholder="Search for parts..."
              className="w-full py-3 px-4 pl-10 bg-white bg-opacity-10 border border-neutral-700 rounded-md text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <SearchIcon size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400" />
          </div>
        </div>
      </div>

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
              {showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>

          {/* Filters Sidebar */}
          <div className={`md:w-1/4 lg:w-1/5 ${showFilters ? 'block' : 'hidden md:block'}`}>
            <div className="bg-white border border-neutral-200 rounded-lg p-4 sticky top-24">
              <div className="mb-6">
                <h3 className="font-medium text-neutral-900 mb-3">Category</h3>
                <select
                  value={selectedCategory}
                  onChange={handleCategoryChange}
                  className="w-full border border-neutral-300 rounded-md p-2 text-sm"
                >
                  <option value="">All Categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-neutral-900">Price Range</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-500">Min Price:</span>
                    <span className="text-sm font-medium">${priceRange[0]}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    step="5"
                    value={priceRange[0]}
                    onChange={(e) => handlePriceChange(0, e.target.value)}
                    className="w-full"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-500">Max Price:</span>
                    <span className="text-sm font-medium">${priceRange[1]}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    step="5"
                    value={priceRange[1]}
                    onChange={(e) => handlePriceChange(1, e.target.value)}
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

              <button className="w-full py-2 border border-neutral-300 rounded-md text-neutral-700 hover:bg-neutral-50 transition-colors">
                Apply Filters
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="md:w-3/4 lg:w-4/5">
            {/* Sort Options */}
            <div className="flex items-center justify-between mb-6 bg-white border border-neutral-200 rounded-lg p-3">
              <span className="text-neutral-600 text-sm hidden sm:inline">
                {isLoading ? 'Searching...' : `${results.length} results for "${query}"`}
              </span>
              <div className="flex items-center ml-auto">
                <label htmlFor="sort" className="text-sm text-neutral-600 mr-2">
                  Sort by:
                </label>
                <select
                  id="sort"
                  value={sortBy}
                  onChange={handleSortChange}
                  className="border border-neutral-300 rounded-md p-1.5 text-sm"
                >
                  <option value="relevance">Relevance</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="rating">Top Rated</option>
                  <option value="discount">Largest Discount</option>
                </select>
              </div>
            </div>

            {/* Products Grid */}
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
              </div>
            ) : results.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {results.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white border border-neutral-200 rounded-lg">
                <p className="text-neutral-600 mb-2">No results found for "{query}"</p>
                <p className="text-neutral-500 mb-6">Try adjusting your search or filter to find what you're looking for.</p>
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

export default SearchPage;