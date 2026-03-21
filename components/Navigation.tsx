'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/',         label: 'Discover' },
  { href: '/history',  label: 'History'  },
  { href: '/settings', label: 'Settings' },
  { href: '/admin',    label: 'Admin'    },
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
        background: 'rgba(240, 235, 224, 0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        padding: '8px 12px max(12px, env(safe-area-inset-bottom)) 12px',
        gap: 4,
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
              alignItems: 'center',
              justifyContent: 'center',
              padding: '9px 8px',
              textDecoration: 'none',
              borderRadius: 3,
              background: active ? 'var(--color-brand)' : 'transparent',
              color: active ? '#F5F0E8' : 'var(--color-text-faint)',
              transition: 'all 0.15s',
              fontFamily: 'var(--font-display)',
              fontWeight: active ? 800 : 600,
              fontSize: '0.72rem',
              letterSpacing: active ? '0.01em' : 'normal',
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
