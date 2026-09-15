'use client';

import { OrgProvider } from '@/components/OrgProvider';
import { useSignOut } from '@nhost/nextjs';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useSignOut();

  return (
    <OrgProvider>
      <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f9fafb' }}>
        {/* Sidebar */}
        <div style={{ width: '250px', backgroundColor: 'white', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.5rem', fontWeight: 'bold', fontSize: '1.25rem', borderBottom: '1px solid #e5e7eb' }}>
            AI Workflow Builder
          </div>
          <nav style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Link href="/dashboard" style={{ padding: '0.75rem', borderRadius: '4px', color: '#374151', textDecoration: 'none' }}>
              Dashboard
            </Link>
            <Link href="/workflows" style={{ padding: '0.75rem', borderRadius: '4px', color: '#374151', textDecoration: 'none' }}>
              Workflows
            </Link>
          </nav>
          <div style={{ padding: '1rem', borderTop: '1px solid #e5e7eb' }}>
            <button
              onClick={() => signOut()}
              style={{ width: '100%', padding: '0.75rem', backgroundColor: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </OrgProvider>
  );
}
