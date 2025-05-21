import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ShoppingCart, Menu, X, User, Heart, Truck, PenTool as Tool, ChevronDown } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useSearch } from '../../context/SearchContext';
import { categories } from '../../data/categories';
import MobileMenu from './MobileMenu';

function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [openCategory, setOpenCategory] = useState(null);
  const { cart } = useCart();
  const { handleSearch } = useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchValue.trim()) {
      handleSearch(searchValue);
      setSearchValue('');
    }
  };

  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  const toggleCategory = (categoryId) => {
    setOpenCategory(openCategory === categoryId ? null : categoryId);
  };

  return (
    <header className={`sticky top-0 z-50 w-full transition-all duration-300 ${isScrolled ? 'bg-white shadow-md' : 'bg-white'}`}>
      {/* Top Bar */}
      <div className="bg-primary-900 text-white py-2 px-4">
        <div className="container-custom flex justify-between items-center">
          <div className="hidden md:flex items-center space-x-4 text-sm">
            <div className="flex items-center">
              <Truck size={16} className="mr-2" />
              <span>Free shipping on orders over $99</span>
            </div>
          </div>
          <div className="flex items-center space-x-6 text-sm">
            <Link to="/auth" className="hover:text-primary-200 transition-colors">My Account</Link>
            <Link to="/support" className="hover:text-primary-200 transition-colors">Support</Link>
            <Link to="/track-order" className="hover:text-primary-200 transition-colors">Track Order</Link>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="container-custom py-4">
        <div className="flex items-center justify-between">
          {/* Mobile Menu Toggle */}
          <button 
            className="lg:hidden p-1 text-neutral-700 hover:text-primary-600 transition-colors"
            onClick={toggleMobileMenu}
            aria-label="Toggle mobile menu"
          >
            <Menu size={24} />
          </button>

          {/* Logo */}
          <Link to="/" className="flex items-center">
            <div className="flex items-center text-primary-900 font-bold text-xl md:text-2xl">
              <Tool className="mr-2" />
              <span>AutoSpares</span>
            </div>
          </Link>

          {/* Search Bar */}
          <form 
            className="hidden md:flex flex-grow max-w-xl mx-4 lg:mx-8 relative"
            onSubmit={handleSearchSubmit}
          >
            <input
              type="text"
              placeholder="Search for parts by name, brand or part number..."
              className="w-full rounded-l-md border-y border-l border-neutral-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
            <button 
              type="submit" 
              className="bg-primary-600 text-white px-4 py-2 rounded-r-md hover:bg-primary-700 transition-colors"
              aria-label="Search"
            >
              <Search size={20} />
            </button>
          </form>

          {/* Right Nav Icons */}
          <div className="flex items-center space-x-4">
            <Link to="/wishlist" className="hidden md:flex items-center text-neutral-600 hover:text-primary-600 transition-colors">
              <Heart size={20} />
              <span className="ml-1 hidden lg:inline">Wishlist</span>
            </Link>
            <Link to="/auth" className="hidden md:flex items-center text-neutral-600 hover:text-primary-600 transition-colors">
              <User size={20} />
              <span className="ml-1 hidden lg:inline">Account</span>
            </Link>
            <Link to="/cart" className="flex items-center text-neutral-600 hover:text-primary-600 transition-colors relative">
              <ShoppingCart size={20} />
              <span className="ml-1 hidden lg:inline">Cart</span>
              {cart.totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-accent-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {cart.totalItems}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile Search */}
        <div className="md:hidden mt-4">
          <form 
            className="flex relative"
            onSubmit={handleSearchSubmit}
          >
            <input
              type="text"
              placeholder="Search parts..."
              className="w-full rounded-l-md border-y border-l border-neutral-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
            <button 
              type="submit" 
              className="bg-primary-600 text-white px-3 py-2 rounded-r-md hover:bg-primary-700 transition-colors"
              aria-label="Search"
            >
              <Search size={18} />
            </button>
          </form>
        </div>
      </div>

      {/* Categories Navigation */}
      <nav className="hidden lg:block bg-neutral-100 border-t border-neutral-200">
        <div className="container-custom">
          <ul className="flex justify-between">
            {categories.slice(0, 8).map((category) => (
              <li 
                key={category.id} 
                className="relative group"
                onMouseEnter={() => toggleCategory(category.id)}
                onMouseLeave={() => toggleCategory(null)}
              >
                <Link 
                  to={`/category/${category.slug}`}
                  className="flex items-center px-3 py-3 text-sm font-medium text-neutral-700 hover:text-primary-600 transition-colors"
                >
                  {category.name}
                  <ChevronDown size={16} className="ml-1" />
                </Link>

                {/* Dropdown Menu */}
                {openCategory === category.id && (
                  <div className="absolute left-0 mt-0 w-56 bg-white shadow-lg rounded-b-md z-20 animate-fadeIn">
                    <ul className="py-2">
                      {category.subcategories.map((subcategory) => (
                        <li key={subcategory.id}>
                          <Link 
                            to={`/category/${category.slug}/${subcategory.slug}`}
                            className="block px-4 py-2 text-sm text-neutral-700 hover:bg-primary-50 hover:text-primary-600 transition-colors"
                          >
                            {subcategory.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <MobileMenu 
          categories={categories} 
          onClose={toggleMobileMenu} 
        />
      )}
    </header>
  );
}

export default Header;