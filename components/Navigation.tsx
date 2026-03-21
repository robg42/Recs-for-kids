'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Discover', emoji: '🗺️' },
  { href: '/history', label: 'History', emoji: '📖' },
  { href: '/settings', label: 'Settings', emoji: '⚙️' },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--color-bg-card)',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
        zIndex: 50,
      }}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '6px 8px',
              textDecoration: 'none',
              color: active ? 'var(--color-orange)' : 'var(--color-text-faint)',
              transition: 'color 0.15s',
            }}
          >
            <span style={{ fontSize: 22 }}>{tab.emoji}</span>
            <span
              style={{
                fontSize: '0.7rem',
                fontFamily: 'var(--font-display)',
                fontWeight: active ? 700 : 600,
              }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
