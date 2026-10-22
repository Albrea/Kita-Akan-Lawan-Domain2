import { createClient } from '@/lib/supabase/server';
import { formatMYR, formatTime } from '@/lib/utils';
import { AlertTriangle, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export const revalidate = 0;

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: products } = await supabase.from('products').select('*');
  const { data: recentMovements } = await supabase
    .from('stock_movements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(6);

  const productList = products || [];
  const movements = recentMovements || [];

  const outOfStock = productList.filter((p) => p.stock === 0);
  const lowStock = productList.filter((p) => p.stock > 0 && p.stock <= p.threshold);
  const totalStockUnits = productList.reduce((acc, p) => acc + p.stock, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Overview of your inventory status today</p>
        </div>
        <div className="row">
          <Link href="/stock-in" className="btn btn-primary">
            <Plus size={16} /> Record Stock In
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <div className="muted" style={{ fontSize: '13px', fontWeight: 500 }}>Total Products</div>
          <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '4px' }}>{productList.length}</div>
        </div>
        <div className="card" style={{ padding: '20px' }}>
          <div className="muted" style={{ fontSize: '13px', fontWeight: 500 }}>Units in Stock</div>
          <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '4px' }}>{totalStockUnits}</div>
        </div>
        <div className="card" style={{ padding: '20px', background: 'var(--amber-bg)', borderColor: 'var(--amber-br)' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--amber-fg)' }}>Low Stock Items</div>
          <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '4px', color: 'var(--amber-fg)' }}>{lowStock.length}</div>
        </div>
        <div className="card" style={{ padding: '20px', background: 'var(--red-bg)', borderColor: 'var(--red-br)' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--red-fg)' }}>Out of Stock</div>
          <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '4px', color: 'var(--red-fg)' }}>{outOfStock.length}</div>
        </div>
      </div>

      {/* Recent Movements */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-head">
          <h2 className="card-title">Recent Stock Activity</h2>
          <Link href="/history" className="muted" style={{ fontSize: '13px' }}>View all history</Link>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '100px' }}>Time</th>
              <th style={{ width: '150px' }}>SKU</th>
              <th>Activity</th>
              <th className="right" style={{ width: '120px' }}>Quantity</th>
              <th style={{ width: '160px' }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {movements.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-2)' }}>No recent activities.</td>
              </tr>
            ) : (
              movements.map((m) => (
                <tr key={m.id}>
                  <td className="muted">{formatTime(m.created_at)}</td>
                  <td className="mono">{m.sku}</td>
                  <td>
                    <span className={`chip ${m.activity === 'Stock In' ? 'chip-green' : m.activity === 'Stock Out' ? 'chip-red' : 'chip-amber'}`}>
                      {m.activity}
                    </span>
                  </td>
                  <td className="right bold" style={{ color: m.quantity_change > 0 ? 'var(--green-fg)' : 'var(--red-fg)' }}>
                    {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                  </td>
                  <td className="muted">{m.source}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Low Stock Warning Section */}
      <div className="card">
        <div className="card-head">
          <div className="row" style={{ gap: '8px' }}>
            <AlertTriangle size={18} color="var(--warning)" />
            <h2 className="card-title">Needs Attention ({outOfStock.length + lowStock.length})</h2>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '150px' }}>SKU</th>
              <th>Product Name</th>
              <th className="right" style={{ width: '120px' }}>Current Stock</th>
              <th className="right" style={{ width: '140px' }}>Threshold</th>
              <th style={{ width: '140px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[...outOfStock, ...lowStock].map((p) => (
              <tr key={p.id}>
                <td className="mono">{p.sku}</td>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td className="right bold" style={{ color: p.stock === 0 ? 'var(--red-fg)' : 'var(--amber-fg)' }}>
                  {p.stock}
                </td>
                <td className="right muted">{p.threshold}</td>
                <td>
                  <span className={`chip ${p.stock === 0 ? 'chip-red' : 'chip-amber'}`}>
                    {p.stock === 0 ? 'Out of Stock' : 'Low Stock'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}