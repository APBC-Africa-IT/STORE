import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useLoginMutation, useRegisterMutation } from '../slices/UserApiSlice';
import { setCredentials } from '../slices/AuthSlice';
import {
  AuthLayout,
  LoginForm,
  RegisterForm,
  ForgotPasswordForm,
  GoogleSignInButton
} from '../components/auth';

function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    confirmPassword: ''
  });

  const dispatch = useDispatch();
  const { userInfo } = useSelector((state) => state.auth);
  const navigate = useNavigate();
  const location = useLocation();

  const [login, { isLoading: loginLoading }] = useLoginMutation();
  const [register, { isLoading: registerLoading, error: registerError }] = useRegisterMutation();

  

  const redirect = location.search ? location.search.split('=')[1] : '/';

  useEffect(() => {
    if (userInfo) {
      navigate(redirect);
    }
  }, [navigate, redirect, userInfo]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleGoogleSignIn = () => {
    // Google sign-in logic would go here
    console.log('Google sign-in clicked');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const res = await login({
        email: formData.email,
        password: formData.password
      }).unwrap();
      
      dispatch(setCredentials({ ...res }));
      navigate(redirect);
    } catch (err) {
      alert(err?.data?.message || err.error || 'An error occurred');
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    try {
      const res = await register({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password
      }).unwrap();

      // Show success message for registration
      alert(res.message || 'Registration successful! Please check your email for verification.');
      
      // Switch to login form after successful registration
      setIsLogin(true);
      setFormData({
        email: formData.email,
        password: '',
        firstName: '',
        lastName: '',
        confirmPassword: ''
      });
    } catch (err) {
      alert(err?.data?.message || err.error || 'An error occurred');
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    // Handle password reset logic here
    console.log('Reset password for:', formData.email);
  };

  const getLayoutProps = () => {
    if (showForgotPassword) {
      return {
        title: "Reset Password",
        subtitle: "Enter your email to reset your password",
        showBackButton: true,
        onBack: () => setShowForgotPassword(false)
      };
    }
    
    if (isLogin) {
      return {
        title: "Welcome Back",
        subtitle: "Sign in to your account",
        showToggle: true,
        toggleText: "Don't have an account?",
        toggleButtonText: "Sign Up",
        onToggle: () => setIsLogin(false)
      };
    }
    
    return {
      title: "Create Account",
      subtitle: "Join our community of auto enthusiasts",
      showToggle: true,
      toggleText: "Already have an account?",
      toggleButtonText: "Sign In",
      onToggle: () => setIsLogin(true)
    };
  };

  const renderContent = () => {
    if (showForgotPassword) {
      return (
        <ForgotPasswordForm
          email={formData.email}
          onChange={handleChange}
          onSubmit={handleForgotPasswordSubmit}
          isLoading={false}
        />
      );
    }

    return (
      <>
        <GoogleSignInButton onGoogleSignIn={handleGoogleSignIn} />
        
        {isLogin ? (
          <LoginForm
            formData={formData}
            onChange={handleChange}
            onSubmit={handleLoginSubmit}
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword(!showPassword)}
            isLoading={loginLoading}
            onForgotPassword={() => setShowForgotPassword(true)}
          />
        ) : (
          <RegisterForm
            formData={formData}
            onChange={handleChange}
            onSubmit={handleRegisterSubmit}
            showPassword={showPassword}
            showConfirmPassword={showConfirmPassword}
            onTogglePassword={() => setShowPassword(!showPassword)}
            onToggleConfirmPassword={() => setShowConfirmPassword(!showConfirmPassword)}
            isLoading={registerLoading}
          />
        )}
      </>
    );
  };

  return (
    <AuthLayout {...getLayoutProps()}>
      {renderContent()}
    </AuthLayout>
  );
}

export default AuthPage;