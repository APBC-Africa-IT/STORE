import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import AdminSidebar from '../../components/admin/AdminSidebar';
import AdminHeader from '../../components/admin/AdminHeader';
import DashboardOverview from '../../components/admin/DashboardOverview';
import ProductsManagement from '../../components/admin/ProductManagement';
import OrdersManagement from '../../components/admin/OrdersManagement';
import UsersManagement from '../../components/admin/UsersManagement';
import CategoriesManagement from '../../components/admin/CategoriesManagement';
import InventoryManagement from '../../components/admin/InventoryManagement';
import AnalyticsReports from '../../components/admin/AnalyticsReports';
import AdminSettings from '../../components/admin/AdminSettings';

function AdminDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { userInfo } = useSelector((state) => state.auth);

  // Check if user is admin
//   if (!userInfo || !userInfo.isAdmin) {
//     return <Navigate to="/auth" replace />;
//   }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="lg:pl-64">
        <AdminHeader onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="p-4 lg:p-6">
          <Routes>
            <Route path="/" element={<DashboardOverview />} />
            <Route path="/products" element={<ProductsManagement />} />
            <Route path="/orders" element={<OrdersManagement />} />
            <Route path="/users" element={<UsersManagement />} />
            <Route path="/categories" element={<CategoriesManagement />} />
            <Route path="/inventory" element={<InventoryManagement />} />
            <Route path="/analytics" element={<AnalyticsReports />} />
            <Route path="/settings" element={<AdminSettings />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default AdminDashboard;