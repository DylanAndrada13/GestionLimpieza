import React from 'react';
import { ArrowRight, LayoutDashboard, ShoppingCart } from 'lucide-react';
import './mode-selector.css';

export default function ModeSelector({ onSale }) {
  const openManagement = () => window.location.assign('/gestion');

  return (
    <main className="mode-start">
      <div className="mode-start-glow" />
      <header className="mode-start-brand">
        <img src="/nuevologo.jpg" alt="" />
        <span>CR Perfumería</span>
      </header>
      <section className="mode-start-content">
        <span className="mode-kicker">Gestión del local</span>
        <h1>¿Qué querés hacer?</h1>
        <p>Elegí cómo vas a usar CR Perfumería en este dispositivo.</p>
        <div className="mode-options">
          <button type="button" className="mode-option sale" onClick={onSale}>
            <span className="mode-option-icon"><ShoppingCart size={24} /></span>
            <span className="mode-option-copy">
              <strong>Modo venta</strong>
              <small>Escaneá productos y registrá compras desde el mostrador.</small>
            </span>
            <ArrowRight size={20} className="mode-option-arrow" />
          </button>
          <button type="button" className="mode-option manage" onClick={openManagement}>
            <span className="mode-option-icon"><LayoutDashboard size={24} /></span>
            <span className="mode-option-copy">
              <strong>Modo gestión</strong>
              <small>Administrá productos, stock y movimientos desde la computadora.</small>
            </span>
            <ArrowRight size={20} className="mode-option-arrow" />
          </button>
        </div>
      </section>
      <footer className="mode-start-footer">Perfumería y limpieza · Gestión del local</footer>
    </main>
  );
}
