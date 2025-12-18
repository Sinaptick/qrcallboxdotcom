import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './app.jsx'
import Documentation from './Documentation.jsx'
import QRTest from './QRTest.jsx'
import LocationTest from './LocationTest.jsx'
import './index.css'

// Simple path-based routing
function Router() {
  const path = window.location.pathname;

  // Handle /locationtest route
  if (path === '/locationtest') {
    return <LocationTest />;
  }

  if (path === '/qrtest') {
    return <QRTest />;
  }

  // Handle /documentation route
  if (path === '/documentation' || path === '/docs') {
    return <Documentation />;
  }

  // Default to main app
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
)
