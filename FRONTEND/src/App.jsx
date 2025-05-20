import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import HomePage from './pages/HomePage';
import ProductPage from './pages/ProductPage';
import CategoryPage from './pages/CategoryPage';
import CartPage from './pages/CartPage';
import SearchPage from './pages/SearchPage';
import NotFoundPage from './pages/NotFoundPage';
import { CartProvider } from './context/CartContext';
import { SearchProvider } from './context/SearchContext';

function App() {
  return (
    <SearchProvider>
      <CartProvider>
        <div className="flex flex-col min-h-screen">
          <Header />
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/product/:id" element={<ProductPage />} />
              <Route path="/category/:slug" element={<CategoryPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </CartProvider>
    </SearchProvider>
  );
}

export default App;