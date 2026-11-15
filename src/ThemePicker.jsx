import React from 'react';
import { Moon, Sun } from 'lucide-react';
import './theme-picker.css';

export default function ThemePicker({ theme, onChange }) {
  return (
    <div className="theme-picker" role="group" aria-label="Tema de la aplicación">
      <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => onChange('light')} aria-pressed={theme === 'light'} aria-label="Usar modo claro"><Sun size={16} /><span>Claro</span></button>
      <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => onChange('dark')} aria-pressed={theme === 'dark'} aria-label="Usar modo oscuro"><Moon size={16} /><span>Oscuro</span></button>
    </div>
  );
}
