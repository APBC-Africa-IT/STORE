import React, { createContext, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SearchContext = createContext();

export const SearchProvider = ({ children }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchParams, setSearchParams] = useState({
    query: '',
    category: '',
    minPrice: '',
    maxPrice: '',
    sortBy: 'relevance',
  });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSearch = (query) => {
    setSearchTerm(query);
    setSearchParams(prev => ({ ...prev, query }));
    setIsLoading(true);
    
    // Simulate search delay
    setTimeout(() => {
      setIsLoading(false);
      navigate(`/search?q=${encodeURIComponent(query)}`);
    }, 500);
  };

  const updateFilters = (filters) => {
    setSearchParams(prev => ({ ...prev, ...filters }));
  };

  return (
    <SearchContext.Provider
      value={{
        searchTerm,
        setSearchTerm,
        searchParams,
        handleSearch,
        updateFilters,
        isLoading,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
};

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
};