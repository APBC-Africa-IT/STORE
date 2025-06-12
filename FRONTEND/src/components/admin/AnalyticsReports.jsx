import React, { useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingCart, 
  Users, 
  Package,
  Calendar,
  Download,
  Eye,
  BarChart3
} from 'lucide-react';

function AnalyticsReports() {
  const [dateRange, setDateRange] = useState('30days');

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
      name: 'Products Sold',
      value: '5,432',
      change: '+201',
      changeType: 'increase',
      icon: Package,
      color: 'bg-orange-500'
    },
  ];

  const topProducts = [
    { name: 'Premium Brake Pad Set', sales: 145, revenue: '$12,950', growth: '+15%' },
    { name: 'Engine Oil Filter', sales: 132, revenue: '$1,716', growth: '+8%' },
    { name: 'Heavy-Duty Alternator', sales: 98, revenue: '$17,642', growth: '-5%' },
    { name: 'High-Flow Air Filter', sales: 87, revenue: '$2,607', growth: '+12%' },
    { name: 'AGM Car Battery', sales: 76, revenue: '$12,159', growth: '+22%' },
  ];

  const salesData = [
    { month: 'Jan', sales: 4000, orders: 240 },
    { month: 'Feb', sales: 3000, orders: 198 },
    { month: 'Mar', sales: 5000, orders: 300 },
    { month: 'Apr', sales: 4500, orders: 278 },
    { month: 'May', sales: 6000, orders: 356 },
    { month: 'Jun', sales: 5500, orders: 334 },
  ];

  const customerSegments = [
    { segment: 'New Customers', count: 234, percentage: 45, color: 'bg-blue-500' },
    { segment: 'Returning Customers', count: 456, percentage: 35, color: 'bg-green-500' },
    { segment: 'VIP Customers', count: 123, percentage: 20, color: 'bg-purple-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Analytics & Reports</h1>
          <p className="text-neutral-600">Track performance and generate insights</p>
        </div>
        <div className="flex items-center space-x-3 mt-4 sm:mt-0">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="7days">Last 7 days</option>
            <option value="30days">Last 30 days</option>
            <option value="90days">Last 90 days</option>
            <option value="1year">Last year</option>
          </select>
          <button className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition-colors flex items-center">
            <Download size={16} className="mr-2" />
            Export Report
          </button>
        </div>
      </div>

      {/* Key Metrics */}
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
                <span className="text-sm text-neutral-500 ml-1">from last period</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-neutral-900">Sales Overview</h2>
            <BarChart3 className="text-neutral-400" size={20} />
          </div>
          <div className="space-y-4">
            {salesData.map((data, index) => (
              <div key={data.month} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-neutral-700 w-8">{data.month}</span>
                  <div className="flex-1 bg-neutral-200 rounded-full h-2 w-32">
                    <div 
                      className="bg-primary-600 h-2 rounded-full" 
                      style={{ width: `${(data.sales / 6000) * 100}%` }}
                    ></div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-neutral-900">${data.sales.toLocaleString()}</div>
                  <div className="text-xs text-neutral-500">{data.orders} orders</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-neutral-900">Top Products</h2>
            <button className="text-primary-600 hover:text-primary-800 text-sm font-medium">
              View all
            </button>
          </div>
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
                <div className="text-right">
                  <div className="text-sm font-medium text-neutral-900">{product.revenue}</div>
                  <div className={`text-xs ${
                    product.growth.startsWith('+') ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {product.growth}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer Segments */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-6">Customer Segments</h2>
          <div className="space-y-4">
            {customerSegments.map((segment) => (
              <div key={segment.segment}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-neutral-700">{segment.segment}</span>
                  <span className="text-sm text-neutral-900">{segment.count}</span>
                </div>
                <div className="w-full bg-neutral-200 rounded-full h-2">
                  <div 
                    className={`${segment.color} h-2 rounded-full`}
                    style={{ width: `${segment.percentage}%` }}
                  ></div>
                </div>
                <div className="text-xs text-neutral-500 mt-1">{segment.percentage}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-6">Recent Activity</h2>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
              <div>
                <p className="text-sm font-medium text-neutral-900">New order #3210</p>
                <p className="text-xs text-neutral-500">$250.00 • 2 minutes ago</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
              <div>
                <p className="text-sm font-medium text-neutral-900">Product restocked</p>
                <p className="text-xs text-neutral-500">Brake Pad Set • 1 hour ago</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-purple-500 rounded-full mt-2"></div>
              <div>
                <p className="text-sm font-medium text-neutral-900">New customer registered</p>
                <p className="text-xs text-neutral-500">John Smith • 3 hours ago</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2"></div>
              <div>
                <p className="text-sm font-medium text-neutral-900">Low stock alert</p>
                <p className="text-xs text-neutral-500">Oil Filter • 5 hours ago</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Reports */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-6">Quick Reports</h2>
          <div className="space-y-3">
            <button className="w-full p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors text-left">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-900">Sales Report</p>
                  <p className="text-xs text-neutral-500">Monthly sales breakdown</p>
                </div>
                <Eye size={16} className="text-neutral-400" />
              </div>
            </button>
            <button className="w-full p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors text-left">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-900">Inventory Report</p>
                  <p className="text-xs text-neutral-500">Stock levels and movements</p>
                </div>
                <Eye size={16} className="text-neutral-400" />
              </div>
            </button>
            <button className="w-full p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors text-left">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-900">Customer Report</p>
                  <p className="text-xs text-neutral-500">Customer analytics</p>
                </div>
                <Eye size={16} className="text-neutral-400" />
              </div>
            </button>
            <button className="w-full p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors text-left">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-900">Financial Report</p>
                  <p className="text-xs text-neutral-500">Revenue and expenses</p>
                </div>
                <Eye size={16} className="text-neutral-400" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsReports;