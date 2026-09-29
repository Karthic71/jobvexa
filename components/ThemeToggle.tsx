'use client';
import { useEffect, useState } from 'react';

type Mode = 'light' | 'dark';

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('dark');
  useEffect(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    setMode(attr === 'light' || attr === 'dark' ? attr : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);
  const flip = () => {
    const next: Mode = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('jobvexa.theme', next); } catch { /* storage unavailable */ }
  };
  return (
    <button onClick={flip} aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`} title="Toggle light / dark" className="btn-ghost !px-2.5">
      {mode === 'dark' ? '☀️ Light' : '🌙 Dark'}
    </button>
  );
}
