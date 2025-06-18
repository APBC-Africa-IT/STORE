import React from 'react';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import FormInput from './FormInput';

const LoginForm = ({
  formData,
  onChange,
  onSubmit,
  showPassword,
  onTogglePassword,
  isLoading,
  onForgotPassword
}) => {
  return (
    <form onSubmit={onSubmit}>
      <FormInput
        label="Email Address"
        type="email"
        name="email"
        value={formData.email}
        onChange={onChange}
        placeholder="you@example.com"
        icon={Mail}
        required
      />

      <FormInput
        label="Password"
        name="password"
        value={formData.password}
        onChange={onChange}
        placeholder="••••••••"
        icon={Lock}
        showPasswordToggle
        showPassword={showPassword}
        onTogglePassword={onTogglePassword}
        required
      />

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
          onClick={onForgotPassword}
          className="text-sm font-medium text-primary-600 hover:text-primary-800"
        >
          Forgot password?
        </button>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading && (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
        )}
        Sign In
        <ArrowRight size={16} className="ml-2" />
      </button>
    </form>
  );
};

export default LoginForm;