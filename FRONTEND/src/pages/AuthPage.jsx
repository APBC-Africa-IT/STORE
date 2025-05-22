import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, User, ArrowRight, Eye, EyeOff } from 'lucide-react';

function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    confirmPassword: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle authentication logic here
    console.log('Form submitted:', formData);
  };

  const handleForgotPassword = (e) => {
    e.preventDefault();
    // Handle password reset logic here
    console.log('Reset password for:', formData.email);
  };

  const handleGoogleSignIn = () => {
    // Google sign-in logic would go here
    console.log('Google sign-in clicked');
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-neutral-900">
              {showForgotPassword 
                ? "Reset Password"
                : isLogin 
                  ? "Welcome Back" 
                  : "Create Account"}
            </h2>
            <p className="mt-2 text-neutral-600">
              {showForgotPassword 
                ? "Enter your email to reset your password"
                : isLogin 
                  ? "Sign in to your account" 
                  : "Join our community of auto enthusiasts"}
            </p>
          </div>

          {/* Google Sign In Button */}
          {!showForgotPassword && (
            <div className="mb-6">
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center px-4 py-2 border border-neutral-300 rounded-md shadow-sm bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                <img 
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
                  alt="Google logo" 
                  className="w-5 h-5 mr-2"
                />
                Continue with Google
              </button>
              
              <div className="relative mt-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-neutral-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-neutral-500">Or continue with email</span>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={showForgotPassword ? handleForgotPassword : handleSubmit}>
            {/* Name Field (Sign Up only) */}
            {!isLogin && !showForgotPassword && (
              <div className="mb-4">
                <label htmlFor="name" className="block text-sm font-medium text-neutral-700 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User size={20} className="text-neutral-400" />
                  </div>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                    placeholder="John Doe"
                    required
                  />
                </div>
              </div>
            )}

            {/* Email Field */}
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail size={20} className="text-neutral-400" />
                </div>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="block w-full pl-10 pr-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            {/* Password Field (except for forgot password) */}
            {!showForgotPassword && (
              <div className="mb-4">
                <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock size={20} className="text-neutral-400" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-10 py-2 border border-neutral-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPassword ? (
                      <EyeOff size={20} className="text-neutral-400 hover:text-neutral-600" />
                    ) : (
                      <Eye size={20} className="text-neutral-400 hover:text-neutral-600" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Password Field (Sign Up only) */}
            {!isLogin && !showForgotPassword && (
              <div className="mb-4">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-700 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock size={20} className="text-neutral-400" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    id="confirmPassword"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
            )}

            {/* Remember Me & Forgot Password (Login only) */}
            {isLogin && !showForgotPassword && (
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-neutral-300 rounded"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-neutral-700">
                    Remember me
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm font-medium text-primary-600 hover:text-primary-800"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              {showForgotPassword ? (
                <>
                  Reset Password
                  <ArrowRight size={16} className="ml-2" />
                </>
              ) : isLogin ? (
                <>
                  Sign In
                  <ArrowRight size={16} className="ml-2" />
                </>
              ) : (
                <>
                  Create Account
                  <ArrowRight size={16} className="ml-2" />
                </>
              )}
            </button>
          </form>

          {/* Toggle between Sign In and Sign Up */}
          {!showForgotPassword ? (
            <p className="mt-6 text-center text-sm text-neutral-600">
              {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="font-medium text-primary-600 hover:text-primary-800"
              >
                {isLogin ? "Sign Up" : "Sign In"}
              </button>
            </p>
          ) : (
            <p className="mt-6 text-center text-sm text-neutral-600">
              <button
                onClick={() => setShowForgotPassword(false)}
                className="font-medium text-primary-600 hover:text-primary-800"
              >
                Back to Sign In
              </button>
            </p>
          )}
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center text-xs text-neutral-500">
          <p>Protected by industry standard encryption</p>
          <p className="mt-1">We never store your password in plain text</p>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;