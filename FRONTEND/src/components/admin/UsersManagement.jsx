import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  UserPlus, 
  Edit, 
  Trash2, 
  Eye, 
  MoreVertical,
  Mail,
  Phone,
  Calendar,
  Shield,
  ShieldCheck
} from 'lucide-react';

function UsersManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  // Mock data - replace with actual API data
  const users = [
    {
      id: 1,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '+1 (555) 123-4567',
      role: 'Customer',
      status: 'Active',
      joinDate: '2024-01-15',
      orders: 12,
      totalSpent: 1250.00,
      isVerified: true
    },
    {
      id: 2,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      phone: '+1 (555) 234-5678',
      role: 'Customer',
      status: 'Active',
      joinDate: '2024-01-10',
      orders: 8,
      totalSpent: 890.00,
      isVerified: true
    },
    {
      id: 3,
      firstName: 'Bob',
      lastName: 'Johnson',
      email: 'bob@example.com',
      phone: '+1 (555) 345-6789',
      role: 'Admin',
      status: 'Active',
      joinDate: '2023-12-01',
      orders: 0,
      totalSpent: 0,
      isVerified: true
    },
    {
      id: 4,
      firstName: 'Alice',
      lastName: 'Brown',
      email: 'alice@example.com',
      phone: '+1 (555) 456-7890',
      role: 'Customer',
      status: 'Inactive',
      joinDate: '2024-01-05',
      orders: 3,
      totalSpent: 245.00,
      isVerified: false
    },
    {
      id: 5,
      firstName: 'Charlie',
      lastName: 'Wilson',
      email: 'charlie@example.com',
      phone: '+1 (555) 567-8901',
      role: 'Customer',
      status: 'Active',
      joinDate: '2023-12-20',
      orders: 15,
      totalSpent: 2100.00,
      isVerified: true
    },
  ];

  const roleOptions = ['All', 'Customer', 'Admin', 'Moderator'];

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800';
      case 'Inactive': return 'bg-red-100 text-red-800';
      case 'Suspended': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'Admin': return 'bg-purple-100 text-purple-800';
      case 'Moderator': return 'bg-blue-100 text-blue-800';
      case 'Customer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getInitials = (firstName, lastName) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Users Management</h1>
          <p className="text-neutral-600">Manage customer accounts and administrators</p>
        </div>
        <button className="mt-4 sm:mt-0 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition-colors flex items-center">
          <UserPlus size={16} className="mr-2" />
          Add User
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Total Users</p>
              <p className="text-2xl font-bold text-neutral-900">1,234</p>
            </div>
            <div className="bg-blue-500 p-3 rounded-full">
              <Shield className="text-white" size={20} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Active Users</p>
              <p className="text-2xl font-bold text-neutral-900">1,156</p>
            </div>
            <div className="bg-green-500 p-3 rounded-full">
              <ShieldCheck className="text-white" size={20} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">New This Month</p>
              <p className="text-2xl font-bold text-neutral-900">89</p>
            </div>
            <div className="bg-purple-500 p-3 rounded-full">
              <UserPlus className="text-white" size={20} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">Admins</p>
              <p className="text-2xl font-bold text-neutral-900">12</p>
            </div>
            <div className="bg-orange-500 p-3 rounded-full">
              <Shield className="text-white" size={20} />
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
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <button className="px-4 py-2 border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors flex items-center">
            <Filter size={16} className="mr-2" />
            More Filters
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Join Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Orders
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Total Spent
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-neutral-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-neutral-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center mr-3">
                        <span className="text-white text-sm font-medium">
                          {getInitials(user.firstName, user.lastName)}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center">
                          <span className="text-sm font-medium text-neutral-900">
                            {user.firstName} {user.lastName}
                          </span>
                          {user.isVerified && (
                            <ShieldCheck size={14} className="text-green-500 ml-1" />
                          )}
                        </div>
                        <div className="text-sm text-neutral-500">ID: #{user.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-neutral-900 flex items-center">
                      <Mail size={14} className="mr-1 text-neutral-400" />
                      {user.email}
                    </div>
                    <div className="text-sm text-neutral-500 flex items-center">
                      <Phone size={14} className="mr-1 text-neutral-400" />
                      {user.phone}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleColor(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(user.status)}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                    <div className="flex items-center">
                      <Calendar size={14} className="mr-1 text-neutral-400" />
                      {new Date(user.joinDate).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                    {user.orders}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                    ${user.totalSpent.toFixed(2)}
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
            Showing <span className="font-medium">1</span> to <span className="font-medium">5</span> of{' '}
            <span className="font-medium">1,234</span> results
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

export default UsersManagement;