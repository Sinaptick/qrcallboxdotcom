import React from "react";

export function Card({ children, className = "" }) {
  return (
    <div className={`bg-secondary rounded-2xl shadow-sm ring-1 ring-black/5 border border-themed ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle }) {
  return (
    <div className="p-6 border-b border-themed">
      <h2 className="text-xl font-semibold tracking-tight text-primary">{title}</h2>
      {subtitle ? <p className="text-sm text-muted mt-1">{subtitle}</p> : null}
    </div>
  );
}

export function CardBody({ children, className = "" }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}