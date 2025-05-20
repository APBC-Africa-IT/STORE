import React, { createContext, useContext, useReducer, useEffect } from 'react';

const CartContext = createContext();

const initialState = {
  items: [],
  totalItems: 0,
  totalPrice: 0,
};

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existingItemIndex = state.items.findIndex(item => item.id === action.payload.id);
      if (existingItemIndex > -1) {
        const updatedItems = [...state.items];
        updatedItems[existingItemIndex].quantity += action.payload.quantity;
        
        return {
          ...state,
          items: updatedItems,
          totalItems: state.totalItems + action.payload.quantity,
          totalPrice: state.totalPrice + (action.payload.price * action.payload.quantity)
        };
      } else {
        return {
          ...state,
          items: [...state.items, action.payload],
          totalItems: state.totalItems + action.payload.quantity,
          totalPrice: state.totalPrice + (action.payload.price * action.payload.quantity)
        };
      }
    }
    
    case 'REMOVE_ITEM': {
      const existingItem = state.items.find(item => item.id === action.payload);
      if (!existingItem) return state;
      
      return {
        ...state,
        items: state.items.filter(item => item.id !== action.payload),
        totalItems: state.totalItems - existingItem.quantity,
        totalPrice: state.totalPrice - (existingItem.price * existingItem.quantity)
      };
    }
    
    case 'UPDATE_QUANTITY': {
      const { id, quantity } = action.payload;
      const existingItemIndex = state.items.findIndex(item => item.id === id);
      if (existingItemIndex === -1) return state;
      
      const existingItem = state.items[existingItemIndex];
      const quantityDifference = quantity - existingItem.quantity;
      
      const updatedItems = [...state.items];
      updatedItems[existingItemIndex] = {
        ...existingItem,
        quantity
      };
      
      return {
        ...state,
        items: updatedItems,
        totalItems: state.totalItems + quantityDifference,
        totalPrice: state.totalPrice + (existingItem.price * quantityDifference)
      };
    }
    
    case 'CLEAR_CART':
      return initialState;
      
    default:
      return state;
  }
}

export const CartProvider = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  
  // Load cart from localStorage on initial render
  useEffect(() => {
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        Object.keys(cartReducer(initialState, { type: '' })).forEach(key => {
          if (!(key in parsedCart)) {
            throw new Error('Invalid cart data in localStorage');
          }
        });
        
        // Replace the state with saved cart
        Object.entries(parsedCart).forEach(([key, value]) => {
          state[key] = value;
        });
      } catch (error) {
        console.error('Failed to load cart from localStorage:', error);
        localStorage.removeItem('cart');
      }
    }
  }, []);
  
  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(state));
  }, [state]);
  
  const addItem = (product, quantity = 1) => {
    dispatch({
      type: 'ADD_ITEM',
      payload: { ...product, quantity }
    });
  };
  
  const removeItem = (productId) => {
    dispatch({
      type: 'REMOVE_ITEM',
      payload: productId
    });
  };
  
  const updateQuantity = (productId, quantity) => {
    dispatch({
      type: 'UPDATE_QUANTITY',
      payload: { id: productId, quantity }
    });
  };
  
  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' });
  };
  
  return (
    <CartContext.Provider
      value={{
        cart: state,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};