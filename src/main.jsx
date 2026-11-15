import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ManagementApp from './ManagementApp';
import ModeSelector from './ModeSelector';

function initialTheme() {
  try { return localStorage.getItem('cr-perfumeria-theme') === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

function StartupIntro() {
  return (
    <div className="startup-intro" aria-hidden="true">
      <div className="startup-intro-content">
        <img src="/nuevologo.jpg" alt="" />
        <strong>CR Perfumería</strong>
      </div>
    </div>
  );
}

function AppRouter() {
  const [saleMode, setSaleMode] = useState(false);
  const [pathname, setPathname] = useState(window.location.pathname);
  const [theme, setTheme] = useState(initialTheme);
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname);
      setSaleMode(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('cr-perfumeria-theme', theme); } catch { }
  }, [theme]);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setShowIntro(false), reducedMotion ? 40 : 950);
    return () => window.clearTimeout(timer);
  }, []);

  const navigate = path => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setPathname(path);
  };
  const openSaleMode = () => { navigate('/'); setSaleMode(true); };
  const returnToSelector = () => { navigate('/'); setSaleMode(false); };
  const management = pathname.replace(/\/+$/, '') === '/gestion';

  let page;
  if (management) {
    page = <ManagementApp theme={theme} onThemeChange={setTheme} onSales={openSaleMode} onExit={returnToSelector} />;
  } else if (saleMode) {
    page = <App theme={theme} onThemeChange={setTheme} onExit={returnToSelector} />;
  } else {
    page = <ModeSelector theme={theme} onSale={openSaleMode} onManagement={() => navigate('/gestion')} />;
  }

  return <>{page}{showIntro && <StartupIntro />}</>;
}

createRoot(document.getElementById('root')).render(<AppRouter />);
