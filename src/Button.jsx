import React from "react";

export default function Button({ children, onClick, type = "button", disabled, className = "" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${className}`}
    >
      {children}
    </button>
  );
}
