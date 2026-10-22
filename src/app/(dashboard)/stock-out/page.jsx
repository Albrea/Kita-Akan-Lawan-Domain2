'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Search, Plus, Minus, Trash2, CheckCircle2 } from 'lucide-react';
import Toast from '@/components/Toast';

export default function StockOutPage() {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [toastMsg, setToastMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.from('products').select('*').then(({ data }) => setProducts(data || []));
  }, []);

  const triggerToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const toggleSelect = (p) => {
    const exists = selected.find((item) => item.id === p.id);
    if (exists) {
      setSelected(selected.filter((item) => item.id !== p.id));
    } else {
      setSelected([...selected, { ...p, qty: 1 }]);
    }
  };

  const updateQty = (id, delta, maxStock) => {
    setSelected(
      selected.map((item) => {
        if (item.id === id) {
          const next = Math.min(maxStock, Math.max(1, item.qty + delta));
          return { ...item, qty: next };
        }
        return item;
      })
    );
  };

  const saveStockOut = async () => {
    if (!selected.length) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    for (const item of selected) {
      await supabase.from('stock_movements').insert({
        product_id: item.id,
        sku: item.sku,
        quantity_change: -item.qty,
        stock_before: item.stock,
        stock_after: item.stock - item.qty,
        activity: 'Stock Out',
        source: 'Manual',
        created_by: user.id,
      });
    }

    triggerToast(`Successfully recorded Stock Out for ${selected.length} items`);
    setSelected([]);
    setLoading(false);

    const { data } = await supabase.from('products').select('*');
    setProducts(data || []);
  };

  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.sku.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      <Toast message={toastMsg} />
      <div className="page-head">
        <div>
          <h1 className="page-title">Stock Out</h1>
          <p className="page-sub">Select products leaving warehouse and enter quantities</p>
        </div>
        <button
          className="btn btn-primary"
          disabled={!selected.length || loading}
          onClick={saveStockOut}
        >
          <CheckCircle2 size={16} /> Save Stock Out
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Left Panel */}
        <div className="card" style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
          <div className="toolbar">
            <div className="search" style={{ flex: 1 }}>
              <Search size={18} />
              <input
                className="input"
                placeholder="Search product..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.map((p) => {
              const isSelected = selected.some((item) => item.id === p.id);
              const disabled = p.stock <= 0;
              return (
                <div
                  key={p.id}
                  onClick={() => !disabled && toggleSelect(p)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--divider)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.4 : 1,
                    background: isSelected ? 'var(--blue-bg)' : '#fff',
                  }}
                >
                  <div className="stack">
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <span className="mono muted">{p.sku}</span>
                  </div>
                  <div className="stack" style={{ alignItems: 'flex-end' }}>
                    <span style={{ fontWeight: 700 }}>{p.stock}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>available</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel */}
        <div className="card" style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
          <div className="card-head">
            <h2 className="card-title">Selected for Dispatch ({selected.length})</h2>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {selected.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)' }}>
                Select available products from the left to remove stock.
              </div>
            ) : (
              selected.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--divider)',
                  }}
                >
                  <div className="stack" style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600 }}>{item.name}</span>
                    <span className="mono muted">{item.sku} (Max: {item.stock})</span>
                  </div>

                  <div className="row" style={{ gap: '8px' }}>
                    <button className="icon-btn" onClick={() => updateQty(item.id, -1, item.stock)}><Minus size={14} /></button>
                    <span style={{ minWidth: '32px', textAlign: 'center', fontWeight: 700 }}>{item.qty}</span>
                    <button className="icon-btn" onClick={() => updateQty(item.id, 1, item.stock)}><Plus size={14} /></button>
                    <button className="icon-btn del" onClick={() => toggleSelect(item)}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}