'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Search, Save, CheckCircle2 } from 'lucide-react';
import Toast from '@/components/Toast';

export default function StockAuditPage() {
  const [products, setProducts] = useState([]);
  const [counts, setCounts] = useState({});
  const [toastMsg, setToastMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.from('products').select('*').then(({ data }) => {
      setProducts(data || []);
      const initial = {};
      data?.forEach((p) => {
        initial[p.id] = p.stock;
      });
      setCounts(initial);
    });
  }, []);

  const handleCountChange = (id, val) => {
    const num = parseInt(val, 10);
    setCounts({ ...counts, [id]: isNaN(num) ? 0 : num });
  };

  const saveAudit = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    let adjustmentsCount = 0;
    for (const p of products) {
      const physical = counts[p.id];
      const diff = physical - p.stock;

      if (diff !== 0) {
        adjustmentsCount++;
        await supabase.from('stock_movements').insert({
          product_id: p.id,
          sku: p.sku,
          quantity_change: diff,
          stock_before: p.stock,
          stock_after: physical,
          activity: 'Adjustment',
          source: 'Stock Audit',
          created_by: user.id,
        });
      }
    }

    setToastMsg(`Audit complete. Recorded ${adjustmentsCount} adjustments.`);
    setTimeout(() => setToastMsg(null), 3000);
    setLoading(false);

    // Refresh data
    const { data } = await supabase.from('products').select('*');
    setProducts(data || []);
  };

  return (
    <div>
      <Toast message={toastMsg} />
      <div className="page-head">
        <div>
          <h1 className="page-title">Stock Audit</h1>
          <p className="page-sub">Enter verified physical counts to register discrepancies automatically</p>
        </div>
        <button className="btn btn-primary" onClick={saveAudit} disabled={loading}>
          <Save size={16} /> Save Discrepancies
        </button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: '150px' }}>SKU</th>
              <th>Product Name</th>
              <th className="right" style={{ width: '130px' }}>System Stock</th>
              <th className="right" style={{ width: '150px' }}>Physical Count</th>
              <th className="right" style={{ width: '120px' }}>Discrepancy</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const physical = counts[p.id] ?? p.stock;
              const diff = physical - p.stock;
              return (
                <tr key={p.id}>
                  <td className="mono">{p.sku}</td>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td className="right muted">{p.stock}</td>
                  <td className="right">
                    <input
                      type="number"
                      className="input"
                      style={{ width: '90px', textAlign: 'center', height: '36px' }}
                      value={physical}
                      onChange={(e) => handleCountChange(p.id, e.target.value)}
                    />
                  </td>
                  <td
                    className="right bold"
                    style={{
                      color: diff > 0 ? 'var(--green-fg)' : diff < 0 ? 'var(--red-fg)' : 'var(--text-3)',
                    }}
                  >
                    {diff > 0 ? `+${diff}` : diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}