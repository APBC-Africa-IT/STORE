import React from 'react';
import { Mail, ArrowRight } from 'lucide-react';
import FormInput from './FormInput';

const ForgotPasswordForm = ({
  email,
  onChange,
  onSubmit,
  isLoading
}) => {
  return (
    <form onSubmit={onSubmit}>
      <FormInput
        label="Email Address"
        type="email"
        name="email"
        value={email}
        onChange={onChange}
        placeholder="you@example.com"
        icon={Mail}
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
        Reset Password
        <ArrowRight size={16} className="ml-2" />
      </button>
    </form>
  );
};

export default ForgotPasswordForm;