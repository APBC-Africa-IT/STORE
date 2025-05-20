import React from 'react';
import { Link } from 'react-router-dom';
import { MagnifyingGlassIcon, ShieldCheckIcon, TruckIcon, WrenchScrewdriverIcon, StarIcon, UserIcon } from '@heroicons/react/24/outline';

export default function Home() {
  const categories = [
    {
      name: 'Engine Parts',
      image: 'https://images.pexels.com/photos/162553/keys-workshop-mechanic-tools-162553.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
      href: '/category/engine'
    },
    {
      name: 'Brake System',
      image: 'https://images.pexels.com/photos/4489732/pexels-photo-4489732.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
      href: '/category/brakes'
    },
    {
      name: 'Suspension',
      image: 'https://images.pexels.com/photos/4489794/pexels-photo-4489794.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
      href: '/category/suspension'
    },
    {
      name: 'Electrical',
      image: 'https://images.pexels.com/photos/257502/pexels-photo-257502.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
      href: '/category/electrical'
    }
  ];

  const features = [
    {
      name: 'Genuine Parts',
      description: 'All parts are authentic and come with manufacturer warranty',
      icon: <ShieldCheckIcon className="h-6 w-6" />
    },
    {
      name: 'Fast Shipping',
      description: 'Next day delivery available on in-stock items',
      icon: <TruckIcon className="h-6 w-6" />
    },
    {
      name: 'Expert Support',
      description: '24/7 technical support from automotive experts',
      icon: <WrenchScrewdriverIcon className="h-6 w-6" />
    }
  ];

  const featuredProducts = [
    {
      id: 1,
      name: 'High-Performance Brake Kit',
      price: 299.99,
      rating: 5,
      image: 'https://images.pexels.com/photos/2244746/pexels-photo-2244746.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
    },
    {
      id: 2,
      name: 'Premium Oil Filter',
      price: 24.99,
      rating: 4,
      image: 'https://images.pexels.com/photos/162553/keys-workshop-mechanic-tools-162553.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
    },
    {
      id: 3,
      name: 'LED Headlight Set',
      price: 199.99,
      rating: 5,
      image: 'https://images.pexels.com/photos/2244746/pexels-photo-2244746.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
    },
    {
      id: 4,
      name: 'Performance Exhaust System',
      price: 499.99,
      rating: 4,
      image: 'https://images.pexels.com/photos/4489794/pexels-photo-4489794.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
    }
  ];

  return (
    <div className="bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
      
      {/* Enhanced Header */}
      <header className="relative z-50 bg-gray-900/80 backdrop-blur-sm border-b border-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <Link to="/" className="flex items-center space-x-2">
                <img
                  src="https://images.pexels.com/photos/162553/keys-workshop-mechanic-tools-162553.jpeg?auto=compress&cs=tinysrgb&w=50"
                  alt="AutoParts Logo"
                  className="h-10 w-10 rounded-full object-cover"
                />
                <span className="text-xl font-bold text-white">AutoParts</span>
              </Link>
            </div>
            
            <nav className="hidden md:flex items-center space-x-8">
              <Link to="/shop" className="text-gray-300 hover:text-white transition-colors">Shop</Link>
              <Link to="/categories" className="text-gray-300 hover:text-white transition-colors">Categories</Link>
              <Link to="/brands" className="text-gray-300 hover:text-white transition-colors">Brands</Link>
              <Link to="/about" className="text-gray-300 hover:text-white transition-colors">About</Link>
            </nav>

            <div className="flex items-center space-x-4">
              <Link
                to="/signin"
                className="text-gray-300 hover:text-white transition-colors flex items-center space-x-1"
              >
                <UserIcon className="h-5 w-5" />
                <span>Sign In</span>
              </Link>
              <Link
                to="/signup"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-500 transition-colors"
              >
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero section */}
      <div className="relative isolate overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/30 via-purple-500/30 to-pink-500/30 mix-blend-overlay"></div>
        <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8 relative">
          {/* Search Section */}
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Find the Right Parts for Your Vehicle
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-300">
              Search from thousands of OEM and aftermarket parts
            </p>
            <div className="mt-10">
              <div className="flex rounded-lg shadow-lg ring-1 ring-inset ring-white/10">
                <input
                  type="text"
                  className="block w-full rounded-l-lg border-0 bg-white/10 py-4 pl-4 text-white placeholder:text-gray-400 backdrop-blur-sm focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                  placeholder="Enter part number or name..."
                />
                <button
                  type="button"
                  className="relative -ml-px inline-flex items-center gap-x-1.5 rounded-r-lg px-6 py-4 bg-blue-600 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
                >
                  <MagnifyingGlassIcon className="h-5 w-5" />
                  Search
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Products section */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl text-center mb-12">
          Featured Products
        </h2>
        <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4 lg:gap-x-8">
          {featuredProducts.map((product) => (
            <div
              key={product.id}
              className="group relative bg-gray-800/50 rounded-lg overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 backdrop-blur-sm"
            >
              <div className="aspect-h-3 aspect-w-4 bg-gray-200">
                <img
                  src={product.image}
                  alt={product.name}
                  className="h-48 w-full object-cover object-center group-hover:opacity-75 transition-opacity"
                />
              </div>
              <div className="p-4">
                <h3 className="text-lg font-semibold text-white mb-2">{product.name}</h3>
                <div className="flex items-center mb-2">
                  {[...Array(product.rating)].map((_, i) => (
                    <StarIcon key={i} className="h-5 w-5 text-yellow-400" />
                  ))}
                </div>
                <p className="text-xl font-bold text-blue-400">${product.price}</p>
                <button className="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-500 transition-colors">
                  Add to Cart
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categories section */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl text-center mb-12">
          Browse by Category
        </h2>
        <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4 lg:gap-x-8">
          {categories.map((category) => (
            <Link
              key={category.name}
              to={category.href}
              className="group relative bg-gray-800/50 rounded-lg overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 backdrop-blur-sm"
            >
              <div className="aspect-h-3 aspect-w-4 bg-gray-200">
                <img
                  src={category.image}
                  alt={category.name}
                  className="h-64 w-full object-cover object-center group-hover:opacity-75 transition-opacity"
                />
              </div>
              <div className="p-4">
                <h3 className="text-lg font-semibold text-white">{category.name}</h3>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Features section */}
      <div className="py-16 relative">
        <div className="absolute inset-0 bg-blue-500/10 mix-blend-overlay"></div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Why Choose Us
            </h2>
          </div>
          <div className="mx-auto mt-12 max-w-7xl">
            <div className="grid grid-cols-1 gap-y-8 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-3 lg:gap-x-8">
              {features.map((feature) => (
                <div key={feature.name} className="bg-gray-800/50 p-8 rounded-xl shadow-xl backdrop-blur-sm hover:bg-gray-800/70 transition-colors">
                  <div className="text-blue-400 mb-4">
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{feature.name}</h3>
                  <p className="text-gray-300">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-white font-semibold text-lg mb-4">About Us</h3>
              <p className="text-gray-400">Your trusted source for quality automotive parts and accessories.</p>
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg mb-4">Quick Links</h3>
              <ul className="space-y-2">
                <li><Link to="/products" className="text-gray-400 hover:text-white transition-colors">Products</Link></li>
                <li><Link to="/categories" className="text-gray-400 hover:text-white transition-colors">Categories</Link></li>
                <li><Link to="/brands" className="text-gray-400 hover:text-white transition-colors">Brands</Link></li>
                <li><Link to="/deals" className="text-gray-400 hover:text-white transition-colors">Special Deals</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg mb-4">Customer Service</h3>
              <ul className="space-y-2">
                <li><Link to="/contact" className="text-gray-400 hover:text-white transition-colors">Contact Us</Link></li>
                <li><Link to="/shipping" className="text-gray-400 hover:text-white transition-colors">Shipping Info</Link></li>
                <li><Link to="/returns" className="text-gray-400 hover:text-white transition-colors">Returns</Link></li>
                <li><Link to="/faq" className="text-gray-400 hover:text-white transition-colors">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg mb-4">Newsletter</h3>
              <p className="text-gray-400 mb-4">Subscribe to get special offers and updates.</p>
              <div className="flex">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button className="bg-blue-600 text-white px-4 py-2 rounded-r-lg hover:bg-blue-500 transition-colors">
                  Subscribe
                </button>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-12 pt-8 text-center">
            <p className="text-gray-400">&copy; 2024 ModernShop. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}