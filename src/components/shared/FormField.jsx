import React from "react";

export function Input({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  name,
  autoComplete,
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-primary">{label}</span>
      <input
        className="mt-1 w-full rounded-xl border-themed bg-primary text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 border px-3 py-2"
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
      />
    </label>
  );
}

export default Input;