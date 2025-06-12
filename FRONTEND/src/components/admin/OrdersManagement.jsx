import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  Eye, 
  Download, 
  MoreVertical,
  Package,
  Truck,
  CheckCircle,
  Clock
} from 'lucide-react';

function OrdersManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Mock data - replace with actual API data
  const orders = [
    {
      id: '#3210',
      customer: 'John Doe',
      email: 'john@example.com',
      date: '2024-01-15',
      total: 250.00,
      status: 'Completed',
      items: 3,
      paymentMethod: 'Credit Card'
    },
    {
      id: '#3209',
      customer: 'Jane Smith',
      email: 'jane@example.com',
      date: '2024-01-15',
      total: 150.00,
      status: 'Processing',
      items: 2,
      paymentMethod: 'PayPal'
    },
    {
      id: '#3208',
      customer: 'Bob Johnson',
      email: 'bob@example.com',
      date: '2024-01-14',
      total: 350.00,
      status: 'Shipped',
      items: 5,
      paymentMethod: 'Credit Card'
    },
    {
      id: '#3207',
      customer: 'Alice Brown',
      email: 'alice@example.com',
      date: '2024-01-14',
      total: 75.00,
      status: 'Pending',
      items: 1,
      paymentMethod: 'Bank Transfer'
    },
    {
      id: '#3206',
      customer: 'Charlie Wilson',
      email: 'charlie@example.com',
      date: '2024-01-13',
      total: 425.00,
      status: 'Completed',
      items: 4,
      paymentMethod: 'Credit Card'
    },
  ];

  const statusOptions = ['All', 'Pending', 'Processing', 'Shipped', 'Completed', 'Cancelled'];

  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'Processing': return 'bg-blue-100 text-blue-800';
      case 'Shipped': return 'bg-purple-100 text-purple-800';
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Completed': return <CheckCircle size={16} className="text-green-600" />;
      case 'Processing': return <Package size={16} className="text-blue-600" />;
      case 'Shipped': return <Truck size={16} className="text-purple-600" />;
      case 'Pending': return <Clock size={16} className="text-yellow-600" />;
      default: return <Clock size={16} className="text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Orders Management</h1>
          <p className="text-neutral-600">Track and manage customer orders</p>
        </div>
        <button className="mt-4 sm:mt-0 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition-colors flex items-center">
          <Download size={16} className="mr-2" />
          Export Orders
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Total Orders</p>
              <p className="text-2xl font-bold text-neutral-900">2,350</p>
            </div>
            <div className="bg-blue-500 p-3 rounded-full">
              <Package className="text-white" size={20} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Pending</p>
              <p className="text-2xl font-bold text-neutral-900">45</p>
            </div>
            <div className="bg-yellow-500 p-3 rounded-full">
              <Clock className="text-white" size={20} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Processing</p>
              <p className="text-2xl font-bold text-neutral-900">123</p>
            </div>
            <div className="bg-blue-500 p-3 rounded-full">
              <Package className="text-white" size={20} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Completed</p>
              <p className="text-2xl font-bold text-neutral-900">2,182</p>
            </div>
            <div className="bg-green-500 p-3 rounded-full">
              <CheckCircle className="text-white" size={20} />
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
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <button className="px-4 py-2 border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors flex items-center">
            <Filter size={16} className="mr-2" />
            Date Range
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Order ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Payment
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-neutral-200">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-neutral-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-neutral-900">{order.id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-neutral-900">{order.customer}</div>
                      <div className="text-sm text-neutral-500">{order.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                    {new Date(order.date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                    {order.items} items
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                    ${order.total.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getStatusIcon(order.status)}
                      <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                    {order.paymentMethod}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <button className="text-neutral-500 hover:text-primary-600 transition-colors">
                        <Eye size={16} />
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
            Showing <span className="font-medium">1</span> to <span className="font-medium">5</span> of{' '}
            <span className="font-medium">2,350</span> results
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

export default OrdersManagement;