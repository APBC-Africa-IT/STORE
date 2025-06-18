import React from 'react';

const GoogleSignInButton = ({ onGoogleSignIn }) => {
  return (
    <div className="mb-6">
      <button
        onClick={onGoogleSignIn}
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
  );
};

export default GoogleSignInButton;