import React from 'react';
import { Link } from 'react-router-dom';
import { Trash2, ArrowLeft, ShoppingCart, CreditCard, Truck, Lock } from 'lucide-react';
import { useCart } from '../context/CartContext';

function CartPage() {
  const { cart, removeItem, updateQuantity, clearCart } = useCart();

  const handleQuantityChange = (productId, newQuantity) => {
    if (newQuantity < 1) return;
    updateQuantity(productId, newQuantity);
  };

  return (
    <div className="bg-neutral-50 py-8">
      <div className="container-custom">
        <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-6">Shopping Cart</h1>

        {cart.items.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="p-4 border-b border-neutral-200">
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-neutral-900">Your Items ({cart.totalItems})</h2>
                    <button 
                      onClick={clearCart}
                      className="text-sm text-red-600 hover:text-red-800 font-medium transition-colors"
                    >
                      Clear Cart
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-neutral-200">
                  {cart.items.map((item) => (
                    <div key={item.id} className="p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row">
                        {/* Product Image */}
                        <div className="mb-4 sm:mb-0 sm:mr-6 sm:w-24 flex-shrink-0">
                          <Link to={`/product/${item.slug}`}>
                            <img 
                              src={item.image} 
                              alt={item.name} 
                              className="w-full h-24 object-contain"
                            />
                          </Link>
                        </div>

                        {/* Product Details */}
                        <div className="flex-grow">
                          <div className="flex flex-col sm:flex-row justify-between">
                            <div>
                              <Link 
                                to={`/product/${item.slug}`}
                                className="text-neutral-900 font-medium hover:text-primary-700 transition-colors"
                              >
                                {item.name}
                              </Link>
                              {item.compatibleWith && (
                                <p className="text-xs text-neutral-500 mt-1">
                                  Fits: {item.compatibleWith.slice(0, 2).join(', ')}
                                  {item.compatibleWith.length > 2 && ' & more'}
                                </p>
                              )}
                            </div>
                            <div className="mt-2 sm:mt-0 text-right">
                              <span className="font-bold text-neutral-900">${(item.price * item.quantity).toFixed(2)}</span>
                              {item.discount > 0 && (
                                <p className="text-xs text-green-600">
                                  You save: ${((item.originalPrice - item.price) * item.quantity).toFixed(2)}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex justify-between items-center mt-4">
                            <div className="flex items-center">
                              <button 
                                onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                className="w-8 h-8 flex items-center justify-center border border-neutral-300 rounded-l-md bg-neutral-50 text-neutral-600 hover:bg-neutral-100"
                              >
                                -
                              </button>
                              <input 
                                type="number" 
                                min="1" 
                                value={item.quantity}
                                onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 1)}
                                className="w-12 h-8 border-y border-neutral-300 text-center"
                              />
                              <button 
                                onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                                className="w-8 h-8 flex items-center justify-center border border-neutral-300 rounded-r-md bg-neutral-50 text-neutral-600 hover:bg-neutral-100"
                              >
                                +
                              </button>
                            </div>
                            <button 
                              onClick={() => removeItem(item.id)}
                              className="text-neutral-500 hover:text-red-600 transition-colors"
                              aria-label="Remove item"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <Link 
                  to="/" 
                  className="inline-flex items-center text-primary-600 hover:text-primary-800 transition-colors font-medium"
                >
                  <ArrowLeft size={16} className="mr-2" />
                  Continue Shopping
                </Link>
              </div>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-sm overflow-hidden sticky top-24">
                <div className="p-4 border-b border-neutral-200">
                  <h2 className="text-lg font-semibold text-neutral-900">Order Summary</h2>
                </div>
                <div className="p-4">
                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between">
                      <span className="text-neutral-600">Subtotal</span>
                      <span className="text-neutral-900 font-medium">${cart.totalPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-600">Shipping</span>
                      <span className="text-neutral-900 font-medium">Calculated at checkout</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-600">Tax</span>
                      <span className="text-neutral-900 font-medium">Calculated at checkout</span>
                    </div>
                  </div>

                  <div className="border-t border-neutral-200 pt-3 mb-4">
                    <div className="flex justify-between">
                      <span className="text-neutral-900 font-semibold">Total</span>
                      <span className="text-neutral-900 font-bold">${cart.totalPrice.toFixed(2)}</span>
                    </div>
                  </div>

                  <button className="w-full bg-primary-600 text-white py-3 rounded-md font-medium hover:bg-primary-700 transition-colors mb-3 flex items-center justify-center">
                    <CreditCard size={18} className="mr-2" />
                    Proceed to Checkout
                  </button>

                  <div className="flex items-center justify-center space-x-4 text-xs text-neutral-500 mt-4">
                    <div className="flex items-center">
                      <Truck size={14} className="mr-1" />
                      <span>Free shipping over $99</span>
                    </div>
                    <div className="flex items-center">
                      <Lock size={14} className="mr-1" />
                      <span>Secure checkout</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-neutral-100 rounded-full mb-4">
              <ShoppingCart size={24} className="text-neutral-400" />
            </div>
            <h2 className="text-xl font-semibold text-neutral-900 mb-2">Your cart is empty</h2>
            <p className="text-neutral-600 mb-6">Browse our catalog to find quality auto parts for your vehicle.</p>
            <Link 
              to="/" 
              className="bg-primary-600 text-white py-2 px-6 rounded-md font-medium hover:bg-primary-700 transition-colors inline-block"
            >
              Start Shopping
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default CartPage;