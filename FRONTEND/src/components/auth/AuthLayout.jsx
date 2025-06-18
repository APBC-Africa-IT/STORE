import React from 'react';

const AuthLayout = ({ 
  title, 
  subtitle, 
  children, 
  showToggle = false, 
  toggleText, 
  toggleButtonText, 
  onToggle,
  showBackButton = false,
  onBack
}) => {
  return (
    <div className="min-h-screen bg-neutral-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-neutral-900">
              {title}
            </h2>
            <p className="mt-2 text-neutral-600">
              {subtitle}
            </p>
          </div>

          {children}

          {/* Toggle between Sign In and Sign Up */}
          {showToggle && (
            <p className="mt-6 text-center text-sm text-neutral-600">
              {toggleText}{" "}
              <button
                onClick={onToggle}
                className="font-medium text-primary-600 hover:text-primary-800"
              >
                {toggleButtonText}
              </button>
            </p>
          )}

          {/* Back Button */}
          {showBackButton && (
            <p className="mt-6 text-center text-sm text-neutral-600">
              <button
                onClick={onBack}
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
};

export default AuthLayout;