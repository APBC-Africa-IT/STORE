import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Eye, 
  MoreVertical,
  FolderTree,
  Package
} from 'lucide-react';

function CategoriesManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Mock data - replace with actual API data
  const categories = [
    {
      id: 1,
      name: 'Engine Parts',
      slug: 'engine-parts',
      description: 'All engine related components and parts',
      productCount: 145,
      status: 'Active',
      subcategories: 5,
      createdAt: '2024-01-01'
    },
    {
      id: 2,
      name: 'Braking System',
      slug: 'braking-system',
      description: 'Brake pads, discs, calipers and related components',
      productCount: 89,
      status: 'Active',
      subcategories: 4,
      createdAt: '2024-01-01'
    },
    {
      id: 3,
      name: 'Electrical',
      slug: 'electrical',
      description: 'Electrical components, batteries, and wiring',
      productCount: 67,
      status: 'Active',
      subcategories: 5,
      createdAt: '2024-01-01'
    },
    {
      id: 4,
      name: 'Filters',
      slug: 'filters',
      description: 'Oil, air, fuel and cabin filters',
      productCount: 123,
      status: 'Active',
      subcategories: 4,
      createdAt: '2024-01-01'
    },
    {
      id: 5,
      name: 'Suspension & Steering',
      slug: 'suspension-steering',
      description: 'Suspension components and steering parts',
      productCount: 78,
      status: 'Active',
      subcategories: 4,
      createdAt: '2024-01-01'
    },
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800';
      case 'Inactive': return 'bg-red-100 text-red-800';
      case 'Draft': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Categories Management</h1>
          <p className="text-neutral-600">Organize your products into categories and subcategories</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="mt-4 sm:mt-0 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition-colors flex items-center"
        >
          <Plus size={16} className="mr-2" />
          Add Category
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Total Categories</p>
              <p className="text-2xl font-bold text-neutral-900">9</p>
            </div>
            <div className="bg-blue-500 p-3 rounded-full">
              <FolderTree className="text-white" size={20} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Total Products</p>
              <p className="text-2xl font-bold text-neutral-900">502</p>
            </div>
            <div className="bg-green-500 p-3 rounded-full">
              <Package className="text-white" size={20} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Subcategories</p>
              <p className="text-2xl font-bold text-neutral-900">22</p>
            </div>
            <div className="bg-purple-500 p-3 rounded-full">
              <FolderTree className="text-white" size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400" size={16} />
          <input
            type="text"
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Categories Table */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Products
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Subcategories
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-neutral-200">
              {categories.map((category) => (
                <tr key={category.id} className="hover:bg-neutral-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center mr-3">
                        <FolderTree className="text-primary-600" size={20} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-neutral-900">{category.name}</div>
                        <div className="text-sm text-neutral-500">{category.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-neutral-900 max-w-xs truncate">
                      {category.description}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                    {category.productCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                    {category.subcategories}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(category.status)}`}>
                      {category.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                    {new Date(category.createdAt).toLocaleDateString()}
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

      {/* Category Structure Overview */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Category Structure</h2>
        <div className="space-y-4">
          {categories.slice(0, 3).map((category) => (
            <div key={category.id} className="border border-neutral-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-neutral-900">{category.name}</h3>
                <span className="text-sm text-neutral-500">{category.productCount} products</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {/* Mock subcategories */}
                {Array.from({ length: category.subcategories }, (_, i) => (
                  <div key={i} className="bg-neutral-50 rounded px-3 py-1 text-sm text-neutral-700">
                    Subcategory {i + 1}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CategoriesManagement;