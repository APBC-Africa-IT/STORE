import React from 'react';
import { Menu, Bell, Search, User } from 'lucide-react';
import { useSelector } from 'react-redux';

function AdminHeader({ onMenuClick }) {
  const { userInfo } = useSelector((state) => state.auth);

  return (
    <header className="bg-white shadow-sm border-b border-neutral-200">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        <div className="flex items-center">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 text-neutral-500 hover:text-neutral-700"
          >
            <Menu size={20} />
          </button>
          
          <div className="hidden md:flex items-center ml-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400" size={16} />
              <input
                type="text"
                placeholder="Search..."
                className="pl-10 pr-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button className="p-2 text-neutral-500 hover:text-neutral-700 relative">
            <Bell size={20} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
              <User className="text-white" size={16} />
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-neutral-900">
                {userInfo?.firstName} {userInfo?.lastName}
              </p>
              <p className="text-xs text-neutral-500">Administrator</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default AdminHeader;