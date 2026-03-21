'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Discover', emoji: '🗺️' },
  { href: '/history', label: 'History', emoji: '📖' },
  { href: '/settings', label: 'Settings', emoji: '⚙️' },
  { href: '/admin', label: 'Admin', emoji: '🔐' },
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
        background: 'rgba(255, 251, 247, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        padding: '6px 8px max(10px, env(safe-area-inset-bottom)) 8px',
        zIndex: 50,
        boxShadow: '0 -4px 24px rgba(249, 115, 22, 0.06), 0 -1px 0 var(--color-border)',
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
              gap: 3,
              padding: '6px 4px',
              textDecoration: 'none',
              color: active ? 'var(--color-orange)' : 'var(--color-text-faint)',
              transition: 'color 0.15s',
              position: 'relative',
            }}
          >
            {/* Active pill background */}
            {active && (
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 44,
                  height: 36,
                  background: 'var(--color-orange-light)',
                  borderRadius: 12,
                  zIndex: -1,
                }}
              />
            )}
            <span style={{ fontSize: 20, lineHeight: 1 }}>{tab.emoji}</span>
            <span
              style={{
                fontSize: '0.65rem',
                fontFamily: 'var(--font-display)',
                fontWeight: active ? 800 : 600,
                letterSpacing: active ? '0.01em' : 'normal',
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
