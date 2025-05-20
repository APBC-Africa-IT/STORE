import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Truck, 
  Shield, 
  Star, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  ShoppingCart, 
  Heart, 
  Share2, 
  ArrowLeft 
} from 'lucide-react';
import { getProductBySlug, getRelatedProducts } from '../data/products';
import { useCart } from '../context/CartContext';
import ProductCard from '../components/product/ProductCard';

function ProductPage() {
  const { id: productSlug } = useParams();
  const product = getProductBySlug(productSlug);
  const relatedProducts = getRelatedProducts(product?.id);
  
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState('description');
  const [isSpecsOpen, setIsSpecsOpen] = useState(true);

  if (!product) {
    return (
      <div className="container-custom py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Product Not Found</h1>
        <p className="mb-8">The product you're looking for doesn't exist or has been removed.</p>
        <Link to="/" className="btn btn-primary">
          Return to Home
        </Link>
      </div>
    );
  }

  const handleAddToCart = () => {
    addItem(product, quantity);
  };

  const incrementQuantity = () => {
    setQuantity(prev => prev + 1);
  };

  const decrementQuantity = () => {
    if (quantity > 1) {
      setQuantity(prev => prev - 1);
    }
  };

  return (
    <div className="bg-white">
      {/* Breadcrumb */}
      <div className="bg-neutral-100 py-3">
        <div className="container-custom">
          <div className="flex items-center text-sm">
            <Link to="/" className="text-neutral-600 hover:text-primary-600 transition-colors">Home</Link>
            <span className="mx-2 text-neutral-400">/</span>
            <Link to={`/category/${product.category}`} className="text-neutral-600 hover:text-primary-600 transition-colors">
              {product.category.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
            </Link>
            <span className="mx-2 text-neutral-400">/</span>
            <span className="text-neutral-900 font-medium">{product.name}</span>
          </div>
        </div>
      </div>

      {/* Product Content */}
      <div className="container-custom py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Product Image */}
          <div className="bg-white rounded-lg overflow-hidden border border-neutral-200 p-4">
            <div className="aspect-square relative">
              <img 
                src={product.image} 
                alt={product.name} 
                className="w-full h-full object-contain"
              />
              {product.discount > 0 && (
                <div className="absolute top-4 right-4 bg-accent-600 text-white text-sm font-bold px-2 py-1 rounded">
                  -{product.discount}%
                </div>
              )}
            </div>
          </div>

          {/* Product Details */}
          <div>
            <div className="mb-6">
              <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-2">
                {product.name}
              </h1>
              
              {/* Ratings */}
              <div className="flex items-center mb-3">
                <div className="flex items-center text-amber-400 mr-2">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={16}
                      fill={i < Math.floor(product.rating) ? "currentColor" : "none"}
                      className={i < Math.floor(product.rating) ? "text-amber-400" : "text-neutral-300"}
                    />
                  ))}
                </div>
                <span className="text-sm text-neutral-600">{product.rating} ({product.reviewCount} reviews)</span>
              </div>

              {/* Compatibility */}
              {product.compatibleWith && product.compatibleWith.length > 0 && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 mb-4">
                  <div className="text-sm font-medium mb-1">Compatible with:</div>
                  <div className="flex flex-wrap gap-2">
                    {product.compatibleWith.map((item, index) => (
                      <span 
                        key={index}
                        className="bg-white text-neutral-700 text-xs font-medium px-2 py-1 rounded border border-neutral-200"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Price */}
              <div className="mb-4">
                {product.discount > 0 ? (
                  <div className="flex items-center">
                    <span className="text-2xl font-bold text-accent-600 mr-3">${product.price.toFixed(2)}</span>
                    <span className="text-lg text-neutral-500 line-through">${product.originalPrice.toFixed(2)}</span>
                    <span className="ml-3 text-accent-600 text-sm font-medium">You save: ${(product.originalPrice - product.price).toFixed(2)}</span>
                  </div>
                ) : (
                  <span className="text-2xl font-bold text-neutral-900">${product.price.toFixed(2)}</span>
                )}
              </div>

              {/* Stock Status */}
              <div className="mb-6">
                {product.stockStatus === 'in-stock' && (
                  <div className="flex items-center text-green-600">
                    <Check size={16} className="mr-1" />
                    <span className="font-medium">In Stock</span>
                  </div>
                )}
                {product.stockStatus === 'limited' && (
                  <div className="flex items-center text-amber-600">
                    <Check size={16} className="mr-1" />
                    <span className="font-medium">Limited Stock</span>
                  </div>
                )}
                {product.stockStatus === 'out-of-stock' && (
                  <div className="flex items-center text-red-600">
                    <span className="font-medium">Out of Stock</span>
                  </div>
                )}
              </div>

              {/* Add to Cart Section */}
              <div className="border-t border-b border-neutral-200 py-6 mb-6">
                <div className="flex space-x-4">
                  {/* Quantity Selector */}
                  <div className="flex border rounded-md overflow-hidden">
                    <button 
                      onClick={decrementQuantity}
                      disabled={quantity <= 1}
                      className="px-3 py-2 bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors disabled:opacity-50"
                    >
                      <ChevronDown size={16} />
                    </button>
                    <input 
                      type="number" 
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-12 text-center border-x border-neutral-200"
                      min="1"
                    />
                    <button 
                      onClick={incrementQuantity}
                      className="px-3 py-2 bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors"
                    >
                      <ChevronUp size={16} />
                    </button>
                  </div>

                  {/* Add to Cart Button */}
                  <button
                    onClick={handleAddToCart}
                    disabled={product.stockStatus === 'out-of-stock'}
                    className={`flex-grow btn ${
                      product.stockStatus === 'out-of-stock' 
                        ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed' 
                        : 'bg-primary-600 text-white hover:bg-primary-700'
                    } flex items-center justify-center transition-colors`}
                  >
                    <ShoppingCart size={20} className="mr-2" />
                    {product.stockStatus === 'out-of-stock' ? 'Out of Stock' : 'Add to Cart'}
                  </button>

                  {/* Wishlist Button */}
                  <button
                    className="p-3 border border-neutral-300 rounded-md text-neutral-700 hover:text-accent-600 hover:border-accent-600 transition-colors"
                    aria-label="Add to wishlist"
                  >
                    <Heart size={20} />
                  </button>

                  {/* Share Button */}
                  <button
                    className="p-3 border border-neutral-300 rounded-md text-neutral-700 hover:text-primary-600 hover:border-primary-600 transition-colors"
                    aria-label="Share product"
                  >
                    <Share2 size={20} />
                  </button>
                </div>
              </div>

              {/* Shipping & Warranty */}
              <div className="space-y-3 mb-6">
                <div className="flex items-start">
                  <Truck size={18} className="text-primary-600 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-neutral-900">Free shipping</p>
                    <p className="text-sm text-neutral-600">On orders over $99. Order before 4pm for same day dispatch.</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <Shield size={18} className="text-primary-600 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-neutral-900">Warranty</p>
                    <p className="text-sm text-neutral-600">{product.specifications.warranty || '1-year limited warranty'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Product Tabs */}
        <div className="mt-12">
          <div className="border-b border-neutral-200 mb-6">
            <div className="flex space-x-8">
              <button
                className={`py-3 font-medium text-sm border-b-2 -mb-px ${
                  activeTab === 'description' 
                    ? 'border-primary-600 text-primary-600' 
                    : 'border-transparent text-neutral-600 hover:text-neutral-900'
                } transition-colors`}
                onClick={() => setActiveTab('description')}
              >
                Description
              </button>
              <button
                className={`py-3 font-medium text-sm border-b-2 -mb-px ${
                  activeTab === 'features' 
                    ? 'border-primary-600 text-primary-600' 
                    : 'border-transparent text-neutral-600 hover:text-neutral-900'
                } transition-colors`}
                onClick={() => setActiveTab('features')}
              >
                Features
              </button>
              <button
                className={`py-3 font-medium text-sm border-b-2 -mb-px ${
                  activeTab === 'specs' 
                    ? 'border-primary-600 text-primary-600' 
                    : 'border-transparent text-neutral-600 hover:text-neutral-900'
                } transition-colors`}
                onClick={() => setActiveTab('specs')}
              >
                Specifications
              </button>
              <button
                className={`py-3 font-medium text-sm border-b-2 -mb-px ${
                  activeTab === 'reviews' 
                    ? 'border-primary-600 text-primary-600' 
                    : 'border-transparent text-neutral-600 hover:text-neutral-900'
                } transition-colors`}
                onClick={() => setActiveTab('reviews')}
              >
                Reviews ({product.reviewCount})
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="mb-12">
            {activeTab === 'description' && (
              <div className="prose max-w-none">
                <p className="text-neutral-700 leading-relaxed">{product.description}</p>
              </div>
            )}

            {activeTab === 'features' && (
              <div>
                <ul className="space-y-3">
                  {product.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <Check size={16} className="text-green-600 mt-1 mr-2 flex-shrink-0" />
                      <span className="text-neutral-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activeTab === 'specs' && (
              <div>
                <div className="bg-neutral-50 rounded-lg p-6">
                  <h3 className="text-lg font-medium mb-4">Technical Specifications</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(product.specifications).map(([key, value]) => (
                      <div key={key} className="flex">
                        <div className="w-1/3 font-medium text-neutral-700">
                          {key.charAt(0).toUpperCase() + key.slice(1)}:
                        </div>
                        <div className="w-2/3 text-neutral-600">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'reviews' && (
              <div className="text-center py-6">
                <p className="text-neutral-600 mb-4">Customer reviews coming soon.</p>
                <button className="btn btn-primary">Write a Review</button>
              </div>
            )}
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-neutral-900 mb-6">Related Products</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {relatedProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductPage;