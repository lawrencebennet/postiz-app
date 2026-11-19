import React from 'react';

export const LogoTextComponent = () => {
  return (
    <div className="flex items-center gap-2">
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="32" height="32" rx="8" fill="#7C3AED" />
        <path
          d="M8 22V10L16 18V10L24 22H16L8 22Z"
          fill="white"
        />
      </svg>
      <span className="text-2xl font-bold text-white">Neptive</span>
    </div>
  );
};
