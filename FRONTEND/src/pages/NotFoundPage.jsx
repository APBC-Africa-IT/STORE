import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Home } from 'lucide-react';

function NotFoundPage() {
  return (
    <div className="bg-white py-16 md:py-24">
      <div className="container-custom text-center">
        <div className="max-w-md mx-auto">
          <div className="text-primary-600 font-bold text-9xl mb-2">404</div>
          <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-4">Page Not Found</h1>
          <p className="text-neutral-600 mb-8">
            The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
            <Link
              to="/"
              className="btn btn-primary flex items-center justify-center"
            >
              <Home size={18} className="mr-2" />
              Back to Home
            </Link>
            <button
              onClick={() => window.history.back()}
              className="btn btn-secondary flex items-center justify-center"
            >
              <ArrowLeft size={18} className="mr-2" />
              Go Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;