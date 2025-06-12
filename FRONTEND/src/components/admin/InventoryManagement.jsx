import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Package,
  Warehouse,
  RefreshCw
} from 'lucide-react';

function InventoryManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState('All');

  // Mock data - replace with actual API data
  const inventory = [
    {
      id: 1,
      name: 'Premium Brake Pad Set',
      sku: 'BRK-001',
      category: 'Braking System',
      currentStock: 45,
      minStock: 10,
      maxStock: 100,
      reorderPoint: 15,
      status: 'In Stock',
      lastRestocked: '2024-01-10',
      supplier: 'Brake Pro Inc.',
      cost: 65.00,
      value: 2925.00
    },
    {
      id: 2,
      name: 'Engine Oil Filter',
      sku: 'FLT-002',
      category: 'Filters',
      currentStock: 8,
      minStock: 20,
      maxStock: 200,
      reorderPoint: 25,
      status: 'Low Stock',
      lastRestocked: '2024-01-05',
      supplier: 'Filter Solutions',
      cost: 8.50,
      value: 68.00
    },
    {
      id: 3,
      name: 'Heavy-Duty Alternator',
      sku: 'ELC-003',
      category: 'Electrical',
      currentStock: 0,
      minStock: 5,
      maxStock: 50,
      reorderPoint: 8,
      status: 'Out of Stock',
      lastRestocked: '2023-12-20',
      supplier: 'Electric Parts Co.',
      cost: 125.00,
      value: 0.00
    },
    {
      id: 4,
      name: 'High-Flow Air Filter',
      sku: 'FLT-004',
      category: 'Filters',
      currentStock: 75,
      minStock: 15,
      maxStock: 150,
      reorderPoint: 20,
      status: 'In Stock',
      lastRestocked: '2024-01-12',
      supplier: 'Air Flow Systems',
      cost: 18.00,
      value: 1350.00
    },
    {
      id: 5,
      name: 'AGM Car Battery',
      sku: 'BAT-005',
      category: 'Electrical',
      currentStock: 12,
      minStock: 8,
      maxStock: 40,
      reorderPoint: 10,
      status: 'Reorder Soon',
      lastRestocked: '2024-01-08',
      supplier: 'Power Source Ltd.',
      cost: 95.00,
      value: 1140.00
    },
  ];

  const stockOptions = ['All', 'In Stock', 'Low Stock', 'Out of Stock', 'Reorder Soon'];

  const getStatusColor = (status) => {
    switch (status) {
      case 'In Stock': return 'bg-green-100 text-green-800';
      case 'Low Stock': return 'bg-yellow-100 text-yellow-800';
      case 'Out of Stock': return 'bg-red-100 text-red-800';
      case 'Reorder Soon': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStockLevel = (current, min, max) => {
    const percentage = (current / max) * 100;
    if (percentage <= 20) return 'low';
    if (percentage <= 50) return 'medium';
    return 'high';
  };

  const getStockLevelColor = (level) => {
    switch (level) {
      case 'low': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'high': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const totalValue = inventory.reduce((sum, item) => sum + item.value, 0);
  const lowStockItems = inventory.filter(item => item.status === 'Low Stock' || item.status === 'Out of Stock').length;
  const totalItems = inventory.reduce((sum, item) => sum + item.currentStock, 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Inventory Management</h1>
          <p className="text-neutral-600">Monitor stock levels and manage inventory</p>
        </div>
        <button className="mt-4 sm:mt-0 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition-colors flex items-center">
          <RefreshCw size={16} className="mr-2" />
          Update Stock
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Total Items</p>
              <p className="text-2xl font-bold text-neutral-900">{totalItems}</p>
            </div>
            <div className="bg-blue-500 p-3 rounded-full">
              <Package className="text-white" size={20} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Total Value</p>
              <p className="text-2xl font-bold text-neutral-900">${totalValue.toLocaleString()}</p>
            </div>
            <div className="bg-green-500 p-3 rounded-full">
              <TrendingUp className="text-white" size={20} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Low Stock Items</p>
              <p className="text-2xl font-bold text-neutral-900">{lowStockItems}</p>
            </div>
            <div className="bg-yellow-500 p-3 rounded-full">
              <AlertTriangle className="text-white" size={20} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Categories</p>
              <p className="text-2xl font-bold text-neutral-900">9</p>
            </div>
            <div className="bg-purple-500 p-3 rounded-full">
              <Warehouse className="text-white" size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400" size={16} />
            <input
              type="text"
              placeholder="Search inventory..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            className="px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {stockOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <button className="px-4 py-2 border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors flex items-center">
            <Filter size={16} className="mr-2" />
            More Filters
          </button>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  SKU
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Current Stock
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Stock Level
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Last Restocked
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Supplier
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-neutral-200">
              {inventory.map((item) => {
                const stockLevel = getStockLevel(item.currentStock, item.minStock, item.maxStock);
                const stockPercentage = (item.currentStock / item.maxStock) * 100;
                
                return (
                  <tr key={item.id} className="hover:bg-neutral-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-neutral-900">{item.name}</div>
                        <div className="text-sm text-neutral-500">{item.category}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-neutral-900">
                      {item.sku}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-neutral-900">{item.currentStock}</div>
                      <div className="text-xs text-neutral-500">Min: {item.minStock} | Max: {item.maxStock}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-full bg-neutral-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${getStockLevelColor(stockLevel)}`}
                          style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-neutral-500 mt-1">{stockPercentage.toFixed(0)}%</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                      ${item.value.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                      {new Date(item.lastRestocked).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                      {item.supplier}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Low Stock Alert */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-neutral-900">Low Stock Alerts</h2>
            <AlertTriangle className="text-yellow-500" size={20} />
          </div>
          <div className="space-y-3">
            {inventory.filter(item => item.status === 'Low Stock' || item.status === 'Out of Stock').map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-md">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{item.name}</p>
                  <p className="text-xs text-neutral-500">Current: {item.currentStock} | Min: {item.minStock}</p>
                </div>
                <button className="text-xs bg-primary-600 text-white px-3 py-1 rounded-md hover:bg-primary-700 transition-colors">
                  Reorder
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Recent Stock Movements</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border border-neutral-200 rounded-md">
              <div className="flex items-center">
                <TrendingUp className="text-green-500 mr-2" size={16} />
                <div>
                  <p className="text-sm font-medium text-neutral-900">Brake Pad Set</p>
                  <p className="text-xs text-neutral-500">Restocked +50 units</p>
                </div>
              </div>
              <span className="text-xs text-neutral-500">2 hours ago</span>
            </div>
            <div className="flex items-center justify-between p-3 border border-neutral-200 rounded-md">
              <div className="flex items-center">
                <TrendingDown className="text-red-500 mr-2" size={16} />
                <div>
                  <p className="text-sm font-medium text-neutral-900">Oil Filter</p>
                  <p className="text-xs text-neutral-500">Sold -12 units</p>
                </div>
              </div>
              <span className="text-xs text-neutral-500">4 hours ago</span>
            </div>
            <div className="flex items-center justify-between p-3 border border-neutral-200 rounded-md">
              <div className="flex items-center">
                <TrendingUp className="text-green-500 mr-2" size={16} />
                <div>
                  <p className="text-sm font-medium text-neutral-900">Air Filter</p>
                  <p className="text-xs text-neutral-500">Restocked +25 units</p>
                </div>
              </div>
              <span className="text-xs text-neutral-500">1 day ago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InventoryManagement;