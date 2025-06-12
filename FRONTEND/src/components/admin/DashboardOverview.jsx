import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingCart, 
  Users, 
  Package,
  Eye,
  MoreVertical
} from 'lucide-react';

function DashboardOverview() {
  const stats = [
    {
      name: 'Total Revenue',
      value: '$45,231.89',
      change: '+20.1%',
      changeType: 'increase',
      icon: DollarSign,
      color: 'bg-green-500'
    },
    {
      name: 'Orders',
      value: '2,350',
      change: '+180.1%',
      changeType: 'increase',
      icon: ShoppingCart,
      color: 'bg-blue-500'
    },
    {
      name: 'Customers',
      value: '1,234',
      change: '+19%',
      changeType: 'increase',
      icon: Users,
      color: 'bg-purple-500'
    },
    {
      name: 'Products',
      value: '573',
      change: '+201',
      changeType: 'increase',
      icon: Package,
      color: 'bg-orange-500'
    },
  ];

  const recentOrders = [
    { id: '#3210', customer: 'John Doe', amount: '$250.00', status: 'Completed', date: '2 min ago' },
    { id: '#3209', customer: 'Jane Smith', amount: '$150.00', status: 'Processing', date: '5 min ago' },
    { id: '#3208', customer: 'Bob Johnson', amount: '$350.00', status: 'Shipped', date: '10 min ago' },
    { id: '#3207', customer: 'Alice Brown', amount: '$75.00', status: 'Pending', date: '15 min ago' },
    { id: '#3206', customer: 'Charlie Wilson', amount: '$425.00', status: 'Completed', date: '20 min ago' },
  ];

  const topProducts = [
    { name: 'Premium Brake Pad Set', sales: 145, revenue: '$12,950', trend: 'up' },
    { name: 'Engine Oil Filter', sales: 132, revenue: '$1,716', trend: 'up' },
    { name: 'Heavy-Duty Alternator', sales: 98, revenue: '$17,642', trend: 'down' },
    { name: 'High-Flow Air Filter', sales: 87, revenue: '$2,607', trend: 'up' },
    { name: 'AGM Car Battery', sales: 76, revenue: '$12,159', trend: 'up' },
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'Processing': return 'bg-yellow-100 text-yellow-800';
      case 'Shipped': return 'bg-blue-100 text-blue-800';
      case 'Pending': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Dashboard Overview</h1>
        <p className="text-neutral-600">Welcome back! Here's what's happening with your store today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-600">{stat.name}</p>
                  <p className="text-2xl font-bold text-neutral-900">{stat.value}</p>
                </div>
                <div className={`${stat.color} p-3 rounded-full`}>
                  <Icon className="text-white" size={20} />
                </div>
              </div>
              <div className="mt-4 flex items-center">
                {stat.changeType === 'increase' ? (
                  <TrendingUp className="text-green-500 mr-1" size={16} />
                ) : (
                  <TrendingDown className="text-red-500 mr-1" size={16} />
                )}
                <span className={`text-sm font-medium ${
                  stat.changeType === 'increase' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stat.change}
                </span>
                <span className="text-sm text-neutral-500 ml-1">from last month</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
          <div className="p-6 border-b border-neutral-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">Recent Orders</h2>
              <button className="text-primary-600 hover:text-primary-800 text-sm font-medium">
                View all
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{order.customer}</p>
                      <p className="text-xs text-neutral-500">{order.id} • {order.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                    <span className="text-sm font-medium text-neutral-900">{order.amount}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
          <div className="p-6 border-b border-neutral-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">Top Products</h2>
              <button className="text-primary-600 hover:text-primary-800 text-sm font-medium">
                View all
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {topProducts.map((product, index) => (
                <div key={product.name} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-neutral-500">#{index + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{product.name}</p>
                      <p className="text-xs text-neutral-500">{product.sales} sales</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-neutral-900">{product.revenue}</span>
                    {product.trend === 'up' ? (
                      <TrendingUp className="text-green-500" size={16} />
                    ) : (
                      <TrendingDown className="text-red-500" size={16} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors text-left">
            <Package className="text-primary-600 mb-2" size={24} />
            <h3 className="font-medium text-neutral-900">Add New Product</h3>
            <p className="text-sm text-neutral-500">Create a new product listing</p>
          </button>
          <button className="p-4 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors text-left">
            <Users className="text-primary-600 mb-2" size={24} />
            <h3 className="font-medium text-neutral-900">Manage Users</h3>
            <p className="text-sm text-neutral-500">View and manage customers</p>
          </button>
          <button className="p-4 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors text-left">
            <Eye className="text-primary-600 mb-2" size={24} />
            <h3 className="font-medium text-neutral-900">View Analytics</h3>
            <p className="text-sm text-neutral-500">Check detailed reports</p>
          </button>
        </div>
      </div>
    </div>
  );
}

export default DashboardOverview;