import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

const FormInput = ({
  label,
  type = 'text',
  name,
  value,
  onChange,
  placeholder,
  icon: Icon,
  required = false,
  showPasswordToggle = false,
  showPassword = false,
  onTogglePassword,
  className = ''
}) => {
  const inputType = showPasswordToggle ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className={`mb-4 ${className}`}>
      <label htmlFor={name} className="block text-sm font-medium text-neutral-700 mb-1">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon size={20} className="text-neutral-400" />
          </div>
        )}
        <input
          type={inputType}
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          className={`block w-full ${Icon ? 'pl-10' : 'pl-3'} ${showPasswordToggle ? 'pr-10' : 'pr-3'} py-2 border border-neutral-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500`}
          placeholder={placeholder}
          required={required}
        />
        {showPasswordToggle && (
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            {showPassword ? (
              <EyeOff size={20} className="text-neutral-400 hover:text-neutral-600" />
            ) : (
              <Eye size={20} className="text-neutral-400 hover:text-neutral-600" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default FormInput;