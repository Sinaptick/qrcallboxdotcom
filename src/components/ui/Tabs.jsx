import React from "react";

export function Tabs({ tabs, current, onChange }) {
  return (
    <div className="flex gap-1 sm:gap-2 flex-wrap">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm rounded-xl border ${
            current === t
              ? "bg-indigo-600 text-white border-indigo-500"
              : "bg-tertiary text-primary border-themed hover:bg-secondary"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export default Tabs;