import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Twitter, Instagram, Youtube as YouTube, Mail, Phone, MapPin, CreditCard, PenTool as Tool } from 'lucide-react';

function Footer() {
  return (
    <footer className="bg-neutral-900 text-white pt-12 pb-6">
      <div className="container-custom">
        {/* Footer Top - Main sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          {/* Company Info */}
          <div>
            <div className="flex items-center text-white font-bold text-xl mb-4">
              <Tool className="mr-2" />
              <span>AutoSpares</span>
            </div>
            <p className="text-neutral-400 mb-4">
              Your trusted source for quality auto parts, tools, and accessories. Since 2005, we've been delivering the right parts at the right prices.
            </p>
            <div className="flex space-x-4">
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-neutral-400 hover:text-white transition-colors">
                <Facebook size={20} />
              </a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" aria-label="Twitter" className="text-neutral-400 hover:text-white transition-colors">
                <Twitter size={20} />
              </a>
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-neutral-400 hover:text-white transition-colors">
                <Instagram size={20} />
              </a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="text-neutral-400 hover:text-white transition-colors">
                <YouTube size={20} />
              </a>
            </div>
          </div>

          {/* Shop */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Shop</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/category/engine-parts" className="text-neutral-400 hover:text-white transition-colors">Engine Parts</Link>
              </li>
              <li>
                <Link to="/category/braking-system" className="text-neutral-400 hover:text-white transition-colors">Braking System</Link>
              </li>
              <li>
                <Link to="/category/electrical" className="text-neutral-400 hover:text-white transition-colors">Electrical</Link>
              </li>
              <li>
                <Link to="/category/suspension-steering" className="text-neutral-400 hover:text-white transition-colors">Suspension & Steering</Link>
              </li>
              <li>
                <Link to="/category/filters" className="text-neutral-400 hover:text-white transition-colors">Filters</Link>
              </li>
              <li>
                <Link to="/new-arrivals" className="text-neutral-400 hover:text-white transition-colors">New Arrivals</Link>
              </li>
              <li>
                <Link to="/deals" className="text-neutral-400 hover:text-white transition-colors">Deals & Offers</Link>
              </li>
            </ul>
          </div>

          {/* Help & Support */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Customer Service</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/contact" className="text-neutral-400 hover:text-white transition-colors">Contact Us</Link>
              </li>
              <li>
                <Link to="/help" className="text-neutral-400 hover:text-white transition-colors">Help Center</Link>
              </li>
              <li>
                <Link to="/returns" className="text-neutral-400 hover:text-white transition-colors">Returns & Exchanges</Link>
              </li>
              <li>
                <Link to="/shipping" className="text-neutral-400 hover:text-white transition-colors">Shipping Information</Link>
              </li>
              <li>
                <Link to="/warranty" className="text-neutral-400 hover:text-white transition-colors">Warranty Policy</Link>
              </li>
              <li>
                <Link to="/part-finder" className="text-neutral-400 hover:text-white transition-colors">Part Finder</Link>
              </li>
              <li>
                <Link to="/faq" className="text-neutral-400 hover:text-white transition-colors">FAQ</Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Contact Us</h3>
            <ul className="space-y-4">
              <li className="flex items-start">
                <MapPin size={20} className="text-neutral-400 mr-3 mt-1 flex-shrink-0" />
                <span className="text-neutral-400">123 Auto Parts Way<br />Automotive City, AC 12345</span>
              </li>
              <li className="flex items-center">
                <Phone size={20} className="text-neutral-400 mr-3 flex-shrink-0" />
                <a href="tel:+18001234567" className="text-neutral-400 hover:text-white transition-colors">
                  1-800-123-4567
                </a>
              </li>
              <li className="flex items-center">
                <Mail size={20} className="text-neutral-400 mr-3 flex-shrink-0" />
                <a href="mailto:info@autospares.com" className="text-neutral-400 hover:text-white transition-colors">
                  info@autospares.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Newsletter & Payment */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-8 border-t border-neutral-800">
          {/* Newsletter Signup */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Subscribe to our newsletter</h3>
            <p className="text-neutral-400 mb-4">Get the latest updates on new products and special offers</p>
            <form className="flex">
              <input 
                type="email" 
                placeholder="Your email address" 
                className="rounded-l-md px-4 py-2 bg-neutral-800 border-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500 w-full"
                required
              />
              <button 
                type="submit" 
                className="bg-primary-600 hover:bg-primary-700 text-white font-medium px-4 py-2 rounded-r-md transition-colors"
              >
                Subscribe
              </button>
            </form>
          </div>

          {/* Payment Methods */}
          <div className="flex flex-col justify-center md:items-end">
            <h3 className="text-lg font-semibold mb-3">Payment Methods</h3>
            <div className="flex items-center space-x-4">
              <CreditCard size={32} className="text-neutral-400" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" alt="Visa" className="h-8" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" className="h-8" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" alt="PayPal" className="h-8" />
            </div>
          </div>
        </div>

        {/* Bottom - Copyright & Links */}
        <div className="border-t border-neutral-800 pt-6 mt-6 text-sm text-neutral-500">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p>© 2025 AutoSpares. All rights reserved.</p>
            <div className="flex space-x-4 mt-4 md:mt-0">
              <Link to="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
              <Link to="/terms-of-service" className="hover:text-white transition-colors">Terms of Service</Link>
              <Link to="/sitemap" className="hover:text-white transition-colors">Sitemap</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;