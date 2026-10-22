'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getInitials } from '@/lib/utils';
import {
  Package,
  LayoutGrid,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  History,
  Sparkles,
  Settings,
  LogOut,
} from 'lucide-react';
import styles from './Sidebar.module.css';

export default function Sidebar({ profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const role = profile?.role || 'Staff';

  const menu = [
    { href: '/', label: 'Dashboard', icon: LayoutGrid, visible: true },
    { href: '/products', label: 'Products', icon: Boxes, visible: true },
    { href: '/stock-in', label: 'Stock In', icon: ArrowDownToLine, visible: true },
    { href: '/stock-out', label: 'Stock Out', icon: ArrowUpFromLine, visible: role !== 'Staff' },
    { href: '/audit', label: 'Stock Audit', icon: ClipboardList, visible: true },
    { href: '/history', label: 'History', icon: History, visible: true },
    { href: '/forecast', label: 'AI Forecast', icon: Sparkles, visible: role !== 'Staff' },
    { href: '/settings', label: 'Settings', icon: Settings, visible: role === 'Owner' },
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <Package size={24} color="var(--primary)" />
        <span className={styles.brandName}>StockNow</span>
      </div>

      <div className={styles.sideLabel}>Menu</div>
      <nav className={styles.navList}>
        {menu
          .filter((item) => item.visible)
          .map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
      </nav>

      <div className={styles.foot}>
        <div className={styles.profileBtn}>
          <div className={styles.avatar}>{getInitials(profile?.name)}</div>
          <div className="stack" style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.name || 'User'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{role}</span>
          </div>
          <button className="icon-btn del" onClick={handleSignOut} title="Sign Out">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}