'use client';

import { CheckCircle2 } from 'lucide-react';

export default function Toast({ message }) {
  if (!message) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: '28px',
        bottom: '28px',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        boxShadow: '0 4px 18px rgba(0,0,0,0.08)',
        padding: '12px 18px',
      }}
    >
      <CheckCircle2 size={18} color="var(--success)" />
      <span style={{ fontSize: '14px', fontWeight: 500 }}>{message}</span>
    </div>
  );
}