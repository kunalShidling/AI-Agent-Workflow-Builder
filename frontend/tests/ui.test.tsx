import React from 'react';
import { render, screen } from '@testing-library/react';
import { ExecutionTimeline } from '../src/components/ExecutionTimeline';
import { OrgProvider } from '../src/components/OrgProvider';
// Note: This is a conceptual test file demonstrating role-based UI tests.

jest.mock('../src/hooks/useWorkflowRunSubscription', () => ({
  useWorkflowRunSubscription: () => ({
    workflowRun: { status: 'paused' },
    stepRuns: [
      { id: '1', status: 'paused', workflow_step: { name: 'Approval Step', type: 'approval_gate' } }
    ],
    loading: false
  })
}));

jest.mock('../src/components/OrgProvider', () => ({
  useOrg: jest.fn(),
  OrgProvider: ({ children }: any) => <div>{children}</div>
}));

describe('Role-Based UI Rendering', () => {
  it('shows Approve button for owners', () => {
    const { useOrg } = require('../src/components/OrgProvider');
    useOrg.mockReturnValue({ role: 'owner' });

    render(<ExecutionTimeline workflowRunId="test" />);
    expect(screen.getByText('Approve')).toBeDefined();
  });

  it('hides Approve button for viewers', () => {
    const { useOrg } = require('../src/components/OrgProvider');
    useOrg.mockReturnValue({ role: 'viewer' });

    render(<ExecutionTimeline workflowRunId="test" />);
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.getByText('(You do not have permission to approve)')).toBeDefined();
  });
});
