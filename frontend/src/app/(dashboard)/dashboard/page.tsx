'use client';

import { useOrg } from '@/components/OrgProvider';

export default function DashboardPage() {
  const { organization, role, loading } = useOrg();

  if (loading) {
    return <div style={{ padding: '2rem' }}>Loading dashboard...</div>;
  }

  if (!organization) {
    return <div style={{ padding: '2rem' }}>No organization found.</div>;
  }

  const quotaPercent = Math.min(100, Math.round((organization.calls_used / organization.calls_allowed) * 100));

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>

        {/* Organization Card */}
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Organization Details</h2>
          <div style={{ marginBottom: '0.5rem' }}><span style={{ color: '#6b7280' }}>Name:</span> <span style={{ fontWeight: '500' }}>{organization.name}</span></div>
          <div><span style={{ color: '#6b7280' }}>Role:</span> <span style={{
            fontWeight: '600',
            color: role === 'owner' ? '#b91c1c' : role === 'editor' ? '#b45309' : '#1d4ed8',
            textTransform: 'uppercase',
            fontSize: '0.875rem'
          }}>{role}</span></div>
        </div>

        {/* Quota Indicator */}
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Usage Quota</h2>
          <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>{organization.calls_used} / {organization.calls_allowed} calls used</span>
            <span style={{ fontWeight: 'bold', color: quotaPercent >= 100 ? '#ef4444' : '#10b981' }}>{quotaPercent}%</span>
          </div>
          <div style={{ width: '100%', backgroundColor: '#e5e7eb', height: '12px', borderRadius: '9999px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              backgroundColor: quotaPercent >= 100 ? '#ef4444' : quotaPercent > 80 ? '#f59e0b' : '#3b82f6',
              width: `${quotaPercent}%`,
              transition: 'width 0.5s ease-in-out'
            }}></div>
          </div>
          {quotaPercent >= 100 && (
            <div style={{ marginTop: '0.5rem', color: '#ef4444', fontSize: '0.875rem' }}>
              Organization quota exhausted. Workflows cannot be executed.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
