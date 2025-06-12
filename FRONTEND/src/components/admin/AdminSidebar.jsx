import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  X, 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Users, 
  FolderTree, 
  Warehouse, 
  BarChart3, 
  Settings,
  PenTool as Tool
} from 'lucide-react';

function AdminSidebar({ isOpen, onClose }) {
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Products', href: '/admin/products', icon: Package },
    { name: 'Orders', href: '/admin/orders', icon: ShoppingCart },
    { name: 'Users', href: '/admin/users', icon: Users },
    { name: 'Categories', href: '/admin/categories', icon: FolderTree },
    { name: 'Inventory', href: '/admin/inventory', icon: Warehouse },
    { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
    { name: 'Settings', href: '/admin/settings', icon: Settings },
  ];

  const isActive = (href) => {
    if (href === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-neutral-900 bg-opacity-50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-neutral-200">
          <div className="flex items-center">
            <Tool className="w-8 h-8 text-primary-600 mr-2" />
            <span className="text-xl font-bold text-neutral-900">Admin Panel</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1 text-neutral-500 hover:text-neutral-700"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="mt-6 px-3">
          <div className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={onClose}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive(item.href)
                      ? 'bg-primary-100 text-primary-700 border-r-2 border-primary-600'
                      : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
                  }`}
                >
                  <Icon
                    className={`mr-3 h-5 w-5 ${
                      isActive(item.href) ? 'text-primary-600' : 'text-neutral-500 group-hover:text-neutral-700'
                    }`}
                  />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Admin info */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-neutral-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">A</span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-neutral-900">Admin User</p>
              <p className="text-xs text-neutral-500">Administrator</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminSidebar;