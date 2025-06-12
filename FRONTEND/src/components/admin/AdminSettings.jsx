import React, { useState } from 'react';
import { 
  Save, 
  Upload, 
  Mail, 
  Globe, 
  Shield, 
  Bell, 
  CreditCard,
  Truck,
  Settings,
  User,
  Lock
} from 'lucide-react';

function AdminSettings() {
  const [activeTab, setActiveTab] = useState('general');

  const tabs = [
    { id: 'general', name: 'General', icon: Settings },
    { id: 'store', name: 'Store Settings', icon: Globe },
    { id: 'shipping', name: 'Shipping', icon: Truck },
    { id: 'payments', name: 'Payments', icon: CreditCard },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'security', name: 'Security', icon: Shield },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Admin Settings</h1>
        <p className="text-neutral-600">Manage your store configuration and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Settings Navigation */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === tab.id
                        ? 'bg-primary-100 text-primary-700'
                        : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <Icon size={16} className="mr-3" />
                    {tab.name}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Settings Content */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
            {/* General Settings */}
            {activeTab === 'general' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-6">General Settings</h2>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Store Name
                      </label>
                      <input
                        type="text"
                        defaultValue="AutoSpares"
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Store Email
                      </label>
                      <input
                        type="email"
                        defaultValue="info@autospares.com"
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Store Description
                    </label>
                    <textarea
                      rows={4}
                      defaultValue="Your trusted source for quality auto parts, tools, and accessories."
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Store Logo
                    </label>
                    <div className="flex items-center space-x-4">
                      <div className="w-16 h-16 bg-primary-100 rounded-lg flex items-center justify-center">
                        <Settings className="text-primary-600" size={24} />
                      </div>
                      <button className="px-4 py-2 border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors flex items-center">
                        <Upload size={16} className="mr-2" />
                        Upload Logo
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        defaultValue="+1 (800) 123-4567"
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Time Zone
                      </label>
                      <select className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option>UTC-5 (Eastern Time)</option>
                        <option>UTC-6 (Central Time)</option>
                        <option>UTC-7 (Mountain Time)</option>
                        <option>UTC-8 (Pacific Time)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Store Settings */}
            {activeTab === 'store' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-6">Store Settings</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Store Address
                    </label>
                    <textarea
                      rows={3}
                      defaultValue="123 Auto Parts Way, Automotive City, AC 12345"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Currency
                      </label>
                      <select className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option>USD ($)</option>
                        <option>EUR (€)</option>
                        <option>GBP (£)</option>
                        <option>CAD (C$)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Tax Rate (%)
                      </label>
                      <input
                        type="number"
                        defaultValue="8.5"
                        step="0.1"
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-md font-medium text-neutral-900">Store Features</h3>
                    <div className="space-y-3">
                      <label className="flex items-center">
                        <input type="checkbox" defaultChecked className="mr-3" />
                        <span className="text-sm text-neutral-700">Enable customer reviews</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" defaultChecked className="mr-3" />
                        <span className="text-sm text-neutral-700">Allow guest checkout</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" defaultChecked className="mr-3" />
                        <span className="text-sm text-neutral-700">Enable wishlist</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" className="mr-3" />
                        <span className="text-sm text-neutral-700">Maintenance mode</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Shipping Settings */}
            {activeTab === 'shipping' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-6">Shipping Settings</h2>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Free Shipping Threshold
                      </label>
                      <input
                        type="number"
                        defaultValue="99"
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Standard Shipping Rate
                      </label>
                      <input
                        type="number"
                        defaultValue="9.99"
                        step="0.01"
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-md font-medium text-neutral-900 mb-4">Shipping Zones</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 border border-neutral-200 rounded-md">
                        <div>
                          <p className="text-sm font-medium text-neutral-900">United States</p>
                          <p className="text-xs text-neutral-500">Standard: $9.99 | Express: $19.99</p>
                        </div>
                        <button className="text-primary-600 hover:text-primary-800 text-sm">Edit</button>
                      </div>
                      <div className="flex items-center justify-between p-3 border border-neutral-200 rounded-md">
                        <div>
                          <p className="text-sm font-medium text-neutral-900">Canada</p>
                          <p className="text-xs text-neutral-500">Standard: $14.99 | Express: $29.99</p>
                        </div>
                        <button className="text-primary-600 hover:text-primary-800 text-sm">Edit</button>
                      </div>
                    </div>
                    <button className="mt-3 px-4 py-2 border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors">
                      Add Shipping Zone
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Settings */}
            {activeTab === 'payments' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-6">Payment Settings</h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-md font-medium text-neutral-900 mb-4">Payment Methods</h3>
                    <div className="space-y-3">
                      <label className="flex items-center justify-between p-3 border border-neutral-200 rounded-md">
                        <div className="flex items-center">
                          <input type="checkbox" defaultChecked className="mr-3" />
                          <span className="text-sm font-medium text-neutral-900">Credit/Debit Cards</span>
                        </div>
                        <button className="text-primary-600 hover:text-primary-800 text-sm">Configure</button>
                      </label>
                      <label className="flex items-center justify-between p-3 border border-neutral-200 rounded-md">
                        <div className="flex items-center">
                          <input type="checkbox" defaultChecked className="mr-3" />
                          <span className="text-sm font-medium text-neutral-900">PayPal</span>
                        </div>
                        <button className="text-primary-600 hover:text-primary-800 text-sm">Configure</button>
                      </label>
                      <label className="flex items-center justify-between p-3 border border-neutral-200 rounded-md">
                        <div className="flex items-center">
                          <input type="checkbox" className="mr-3" />
                          <span className="text-sm font-medium text-neutral-900">Bank Transfer</span>
                        </div>
                        <button className="text-primary-600 hover:text-primary-800 text-sm">Configure</button>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Stripe Publishable Key
                      </label>
                      <input
                        type="text"
                        placeholder="pk_test_..."
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Stripe Secret Key
                      </label>
                      <input
                        type="password"
                        placeholder="sk_test_..."
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notifications */}
            {activeTab === 'notifications' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-6">Notification Settings</h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-md font-medium text-neutral-900 mb-4">Email Notifications</h3>
                    <div className="space-y-3">
                      <label className="flex items-center">
                        <input type="checkbox" defaultChecked className="mr-3" />
                        <span className="text-sm text-neutral-700">New order notifications</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" defaultChecked className="mr-3" />
                        <span className="text-sm text-neutral-700">Low stock alerts</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" className="mr-3" />
                        <span className="text-sm text-neutral-700">Customer registration notifications</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" defaultChecked className="mr-3" />
                        <span className="text-sm text-neutral-700">Daily sales reports</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-md font-medium text-neutral-900 mb-4">Customer Notifications</h3>
                    <div className="space-y-3">
                      <label className="flex items-center">
                        <input type="checkbox" defaultChecked className="mr-3" />
                        <span className="text-sm text-neutral-700">Order confirmation emails</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" defaultChecked className="mr-3" />
                        <span className="text-sm text-neutral-700">Shipping notifications</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" className="mr-3" />
                        <span className="text-sm text-neutral-700">Marketing emails</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Security */}
            {activeTab === 'security' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-neutral-900 mb-6">Security Settings</h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-md font-medium text-neutral-900 mb-4">Password Policy</h3>
                    <div className="space-y-3">
                      <label className="flex items-center">
                        <input type="checkbox" defaultChecked className="mr-3" />
                        <span className="text-sm text-neutral-700">Require strong passwords</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" className="mr-3" />
                        <span className="text-sm text-neutral-700">Enable two-factor authentication</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" defaultChecked className="mr-3" />
                        <span className="text-sm text-neutral-700">Force password reset every 90 days</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-md font-medium text-neutral-900 mb-4">Session Management</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-2">
                          Session Timeout (minutes)
                        </label>
                        <input
                          type="number"
                          defaultValue="30"
                          className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-2">
                          Max Login Attempts
                        </label>
                        <input
                          type="number"
                          defaultValue="5"
                          className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-md font-medium text-neutral-900 mb-4">Data Protection</h3>
                    <div className="space-y-3">
                      <label className="flex items-center">
                        <input type="checkbox" defaultChecked className="mr-3" />
                        <span className="text-sm text-neutral-700">Enable SSL encryption</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" defaultChecked className="mr-3" />
                        <span className="text-sm text-neutral-700">Log security events</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" className="mr-3" />
                        <span className="text-sm text-neutral-700">Enable GDPR compliance mode</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="border-t border-neutral-200 px-6 py-4">
              <div className="flex justify-end">
                <button className="bg-primary-600 text-white px-6 py-2 rounded-md hover:bg-primary-700 transition-colors flex items-center">
                  <Save size={16} className="mr-2" />
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminSettings;