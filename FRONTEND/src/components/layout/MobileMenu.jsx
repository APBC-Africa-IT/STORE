import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { X, ChevronRight, ChevronDown, User, Heart, Phone, HelpCircle } from 'lucide-react';

function MobileMenu({ categories, onClose }) {
  const [openCategory, setOpenCategory] = useState(null);

  const toggleCategory = (categoryId) => {
    setOpenCategory(openCategory === categoryId ? null : categoryId);
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900 bg-opacity-50" onClick={onClose}>
      <div 
        className="fixed top-0 left-0 h-full w-3/4 max-w-xs bg-white z-10 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex justify-between items-center border-b border-neutral-200">
          <h2 className="font-bold text-lg">Menu</h2>
          <button 
            onClick={onClose}
            className="p-1 text-neutral-500 hover:text-neutral-700"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        {/* Account Links */}
        <div className="p-4 border-b border-neutral-200">
          <div className="flex space-x-4">
            <Link 
              to="/account" 
              className="flex items-center text-neutral-700 hover:text-primary-600 transition-colors" 
              onClick={onClose}
            >
              <User size={20} className="mr-2" />
              My Account
            </Link>
            <Link 
              to="/wishlist" 
              className="flex items-center text-neutral-700 hover:text-primary-600 transition-colors"
              onClick={onClose}
            >
              <Heart size={20} className="mr-2" />
              Wishlist
            </Link>
          </div>
        </div>

        {/* Categories */}
        <div className="p-4">
          <h3 className="text-sm font-medium text-neutral-500 mb-2">Categories</h3>
          <ul>
            {categories.map((category) => (
              <li key={category.id} className="border-b border-neutral-100 last:border-b-0">
                <div className="flex items-center justify-between py-3">
                  <Link 
                    to={`/category/${category.slug}`}
                    className="text-neutral-700 hover:text-primary-600 transition-colors"
                    onClick={onClose}
                  >
                    {category.name}
                  </Link>
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="p-1 text-neutral-500"
                    aria-label={`Toggle ${category.name} subcategories`}
                  >
                    {openCategory === category.id ? (
                      <ChevronDown size={20} />
                    ) : (
                      <ChevronRight size={20} />
                    )}
                  </button>
                </div>

                {/* Subcategories */}
                {openCategory === category.id && (
                  <ul className="pl-4 pb-2">
                    {category.subcategories.map((subcategory) => (
                      <li key={subcategory.id}>
                        <Link 
                          to={`/category/${category.slug}/${subcategory.slug}`}
                          className="block py-2 text-sm text-neutral-600 hover:text-primary-600 transition-colors"
                          onClick={onClose}
                        >
                          {subcategory.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Help Links */}
        <div className="p-4 border-t border-neutral-200">
          <h3 className="text-sm font-medium text-neutral-500 mb-2">Help & Support</h3>
          <ul className="space-y-3">
            <li>
              <Link 
                to="/contact" 
                className="flex items-center text-neutral-700 hover:text-primary-600 transition-colors"
                onClick={onClose}
              >
                <Phone size={18} className="mr-2" />
                Contact Us
              </Link>
            </li>
            <li>
              <Link 
                to="/help" 
                className="flex items-center text-neutral-700 hover:text-primary-600 transition-colors"
                onClick={onClose}
              >
                <HelpCircle size={18} className="mr-2" />
                Help Center
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default MobileMenu;