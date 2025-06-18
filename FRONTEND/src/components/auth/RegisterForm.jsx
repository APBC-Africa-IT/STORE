import React from 'react';
import { Mail, Lock, User, ArrowRight } from 'lucide-react';
import FormInput from './FormInput';

const RegisterForm = ({
  formData,
  onChange,
  onSubmit,
  showPassword,
  showConfirmPassword,
  onTogglePassword,
  onToggleConfirmPassword,
  isLoading
}) => {

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <FormInput
          label="First Name"
          name="firstName"
          value={formData.firstName}
          onChange={onChange}
          placeholder="John"
          icon={User}
          required
          className="mb-0"
        />
        <FormInput
          label="Last Name"
          name="lastName"
          value={formData.lastName}
          onChange={onChange}
          placeholder="Doe"
          required
          className="mb-0"
        />
      </div>

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

      <FormInput
        label="Confirm Password"
        name="confirmPassword"
        value={formData.confirmPassword}
        onChange={onChange}
        placeholder="••••••••"
        icon={Lock}
        showPasswordToggle
        showPassword={showConfirmPassword}
        onTogglePassword={onToggleConfirmPassword}
        required
      />

      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading && (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
        )}
        Create Account
        <ArrowRight size={16} className="ml-2" />
      </button>
    </form>
  );
};

export default RegisterForm;