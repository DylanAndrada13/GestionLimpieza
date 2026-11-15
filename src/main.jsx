import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ManagementApp from './ManagementApp';
import ModeSelector from './ModeSelector';

function AppRouter() {
  const [saleMode, setSaleMode] = useState(false);
  const isManagementRoute = window.location.pathname.replace(/\/+$/, '') === '/gestion';
  if (isManagementRoute) return <ManagementApp />;
  if (saleMode) return <App />;
  return <ModeSelector onSale={() => setSaleMode(true)} />;
}

createRoot(document.getElementById('root')).render(<AppRouter />);
