import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Eye, 
  MoreVertical,
  Star,
  Package
} from 'lucide-react';

function ProductsManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Mock data - replace with actual API data
  const products = [
    {
      id: 1,
      name: 'Premium Brake Pad Set',
      category: 'Braking System',
      price: 89.99,
      stock: 45,
      status: 'Active',
      rating: 4.8,
      sales: 145,
      image: 'https://images.pexels.com/photos/4489749/pexels-photo-4489749.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&dpr=1'
    },
    {
      id: 2,
      name: 'Engine Oil Filter',
      category: 'Filters',
      price: 12.99,
      stock: 120,
      status: 'Active',
      rating: 4.9,
      sales: 203,
      image: 'https://images.pexels.com/photos/4482900/pexels-photo-4482900.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&dpr=1'
    },
    {
      id: 3,
      name: 'Heavy-Duty Alternator',
      category: 'Electrical',
      price: 179.99,
      stock: 8,
      status: 'Low Stock',
      rating: 4.7,
      sales: 92,
      image: 'https://images.pexels.com/photos/3807329/pexels-photo-3807329.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&dpr=1'
    },
    {
      id: 4,
      name: 'High-Flow Air Filter',
      category: 'Filters',
      price: 29.99,
      stock: 0,
      status: 'Out of Stock',
      rating: 4.6,
      sales: 176,
      image: 'https://images.pexels.com/photos/4483610/pexels-photo-4483610.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&dpr=1'
    },
  ];

  const categories = ['All Categories', 'Braking System', 'Filters', 'Electrical', 'Engine Parts'];

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800';
      case 'Low Stock': return 'bg-yellow-100 text-yellow-800';
      case 'Out of Stock': return 'bg-red-100 text-red-800';
      case 'Inactive': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Products Management</h1>
          <p className="text-neutral-600">Manage your product catalog and inventory</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="mt-4 sm:mt-0 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition-colors flex items-center"
        >
          <Plus size={16} className="mr-2" />
          Add Product
        </button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400" size={16} />
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <button className="px-4 py-2 border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors flex items-center">
            <Filter size={16} className="mr-2" />
            More Filters
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Stock
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Rating
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Sales
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-neutral-200">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-neutral-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <img 
                        src={product.image} 
                        alt={product.name}
                        className="w-10 h-10 rounded-md object-cover mr-3"
                      />
                      <div>
                        <div className="text-sm font-medium text-neutral-900">{product.name}</div>
                        <div className="text-sm text-neutral-500">ID: #{product.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                    {product.category}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                    ${product.price}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                    {product.stock}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(product.status)}`}>
                      {product.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Star className="text-yellow-400 mr-1" size={14} fill="currentColor" />
                      <span className="text-sm text-neutral-900">{product.rating}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                    {product.sales}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <button className="text-neutral-500 hover:text-primary-600 transition-colors">
                        <Eye size={16} />
                      </button>
                      <button className="text-neutral-500 hover:text-primary-600 transition-colors">
                        <Edit size={16} />
                      </button>
                      <button className="text-neutral-500 hover:text-red-600 transition-colors">
                        <Trash2 size={16} />
                      </button>
                      <button className="text-neutral-500 hover:text-neutral-700 transition-colors">
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-700">
            Showing <span className="font-medium">1</span> to <span className="font-medium">4</span> of{' '}
            <span className="font-medium">97</span> results
          </div>
          <div className="flex items-center space-x-2">
            <button className="px-3 py-1 border border-neutral-300 rounded-md text-sm hover:bg-neutral-50 transition-colors">
              Previous
            </button>
            <button className="px-3 py-1 bg-primary-600 text-white rounded-md text-sm">1</button>
            <button className="px-3 py-1 border border-neutral-300 rounded-md text-sm hover:bg-neutral-50 transition-colors">
              2
            </button>
            <button className="px-3 py-1 border border-neutral-300 rounded-md text-sm hover:bg-neutral-50 transition-colors">
              3
            </button>
            <button className="px-3 py-1 border border-neutral-300 rounded-md text-sm hover:bg-neutral-50 transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductsManagement;