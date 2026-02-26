import { InputHTMLAttributes } from 'react';

export const Input = ({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={`w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-900 shadow-sm transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300 focus:outline-none placeholder:text-gray-400 ${className}`}
    {...props}
  />
);
