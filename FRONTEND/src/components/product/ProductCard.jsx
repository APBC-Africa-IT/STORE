import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Heart, Star, BarChart2, ShieldCheck } from 'lucide-react';
import { useCart } from '../../context/CartContext';

function ProductCard({ product }) {
  const { addItem } = useCart();

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product);
  };

  const handleWishlist = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Wishlist functionality would go here
  };

  return (
    <div className="card group h-full flex flex-col">
      {/* Stock Status Badge */}
      {product.stockStatus === 'limited' && (
        <div className="absolute top-2 left-2 z-10 bg-amber-500 text-white text-xs font-medium px-2 py-1 rounded">
          Low Stock
        </div>
      )}
      {product.stockStatus === 'out-of-stock' && (
        <div className="absolute top-2 left-2 z-10 bg-red-500 text-white text-xs font-medium px-2 py-1 rounded">
          Out of Stock
        </div>
      )}

      {/* Discount Badge */}
      {product.discount > 0 && (
        <div className="absolute top-2 right-2 z-10 bg-accent-600 text-white text-xs font-bold px-2 py-1 rounded">
          -{product.discount}%
        </div>
      )}

      {/* Product Image with Link */}
      <Link to={`/product/${product.slug}`} className="block relative pt-[100%] overflow-hidden">
        <img 
          src={product.image} 
          alt={product.name}
          className="absolute top-0 left-0 w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
        />
      </Link>

      {/* Product Content */}
      <div className="p-4 flex flex-col flex-grow">
        {/* Product Name */}
        <Link 
          to={`/product/${product.slug}`}
          className="text-neutral-900 font-medium hover:text-primary-700 transition-colors mb-1 line-clamp-2"
        >
          {product.name}
        </Link>

        {/* Compatibility Info */}
        {product.compatibleWith && product.compatibleWith.length > 0 && (
          <div className="flex items-center text-xs text-neutral-500 mb-2">
            <ShieldCheck size={14} className="mr-1" />
            <span>
              Fits: {product.compatibleWith.slice(0, 3).join(', ')}
              {product.compatibleWith.length > 3 && ' & more'}
            </span>
          </div>
        )}

        {/* Ratings */}
        <div className="flex items-center mb-2">
          <div className="flex items-center text-amber-400 mr-1">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                size={14}
                fill={i < Math.floor(product.rating) ? "currentColor" : "none"}
                className={i < Math.floor(product.rating) ? "text-amber-400" : "text-neutral-300"}
              />
            ))}
          </div>
          <span className="text-xs text-neutral-500">({product.reviewCount})</span>
        </div>

        {/* Price Section */}
        <div className="mt-auto mb-3">
          {product.discount > 0 ? (
            <div className="flex items-center">
              <span className="text-accent-600 font-bold mr-2">${product.price.toFixed(2)}</span>
              <span className="text-neutral-500 text-sm line-through">${product.originalPrice.toFixed(2)}</span>
            </div>
          ) : (
            <span className="text-neutral-900 font-bold">${product.price.toFixed(2)}</span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={handleAddToCart}
            disabled={product.stockStatus === 'out-of-stock'}
            className={`flex-grow btn ${
              product.stockStatus === 'out-of-stock' 
                ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed' 
                : 'bg-primary-600 text-white hover:bg-primary-700'
            } py-1.5 text-sm flex items-center justify-center transition-colors`}
          >
            <ShoppingCart size={16} className="mr-1" />
            {product.stockStatus === 'out-of-stock' ? 'Out of Stock' : 'Add to Cart'}
          </button>
          <button
            onClick={handleWishlist}
            className="p-1.5 border border-neutral-300 rounded-md text-neutral-700 hover:text-accent-600 hover:border-accent-600 transition-colors"
            aria-label="Add to wishlist"
          >
            <Heart size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductCard;