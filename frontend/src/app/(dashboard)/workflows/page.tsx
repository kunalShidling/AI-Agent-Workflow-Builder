'use client';

import { useQuery, useMutation } from '@apollo/client';
import { GET_WORKFLOWS } from '@/graphql/queries';
import { CREATE_WORKFLOW } from '@/graphql/mutations';
import { useOrg } from '@/components/OrgProvider';
import { useUserData } from '@nhost/nextjs';
import Link from 'next/link';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

export default function WorkflowsPage() {
  // Organization information
  const {
    organization,
    role,
    loading: orgLoading,
  } = useOrg();

  // Currently logged-in Nhost user
  const user = useUserData();

  // Create workflow form state
  const [showCreate, setShowCreate] = useState(false);
  const [newWfName, setNewWfName] = useState('');

  // Get workflows for the current organization
  const {
    data,
    loading,
    error,
    refetch,
  } = useQuery(GET_WORKFLOWS, {
    variables: {
      orgId: organization?.id,
    },
    skip: !organization?.id,
  });

  // Create workflow mutation
  const [createWorkflow, { loading: creating }] = useMutation(
    CREATE_WORKFLOW,
    {
      onCompleted: () => {
        setShowCreate(false);
        setNewWfName('');
        refetch();
      },
      onError: (error) => {
        console.error('Failed to create workflow:', error);
      },
    }
  );

  // Loading state
  if (orgLoading || loading) {
    return (
      <div style={{ padding: '2rem' }}>
        Loading workflows...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        style={{
          padding: '2rem',
          color: 'red',
        }}
      >
        Failed to load workflows: {error.message}
      </div>
    );
  }

  const workflows = data?.workflows || [];

  // Only owner and editor can create workflows
  const canCreate = role === 'owner' || role === 'editor';

  // Create workflow
  const handleCreateWorkflow = async () => {
    // Make sure organization exists
    if (!organization?.id) {
      alert('Organization is not available.');
      return;
    }

    // Make sure logged-in user exists
    if (!user?.id) {
      alert('User is not authenticated.');
      return;
    }

    // Make sure workflow name is entered
    if (!newWfName.trim()) {
      alert('Please enter a workflow name.');
      return;
    }

    try {
      await createWorkflow({
        variables: {
          name: newWfName.trim(),
          description: '',
          orgId: organization.id,
          createdBy: user.id,
        },
      });
    } catch (error) {
      console.error('Create workflow error:', error);
    }
  };

  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '1000px',
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
        }}
      >
        <h1
          style={{
            fontSize: '1.875rem',
            fontWeight: 'bold',
          }}
        >
          Workflows
        </h1>

        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            style={{
              backgroundColor: '#10b981',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Create Workflow
          </button>
        )}
      </div>

      {/* Create Workflow Form */}
      {showCreate && canCreate && (
        <div
          style={{
            backgroundColor: 'white',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '2rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <h2
            style={{
              fontSize: '1.25rem',
              marginBottom: '1rem',
            }}
          >
            New Workflow
          </h2>

          <div
            style={{
              display: 'flex',
              gap: '1rem',
            }}
          >
            <input
              value={newWfName}
              onChange={(e) => setNewWfName(e.target.value)}
              placeholder="Workflow Name"
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
              }}
            />

            <button
              onClick={handleCreateWorkflow}
              disabled={
                creating ||
                !newWfName.trim() ||
                !organization?.id ||
                !user?.id
              }
              style={{
                backgroundColor: '#3b82f6',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {creating ? 'Saving...' : 'Save'}
            </button>

            <button
              onClick={() => {
                setShowCreate(false);
                setNewWfName('');
              }}
              style={{
                backgroundColor: '#f3f4f6',
                color: '#374151',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* No Workflows */}
      {workflows.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            backgroundColor: 'white',
            borderRadius: '8px',
            color: '#6b7280',
          }}
        >
          No workflows yet. Create one to get started.
        </div>
      ) : (
        /* Workflow List */
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {workflows.map((wf: any) => {
            const lastRun = wf.workflow_runs?.[0];

            return (
              <div
                key={wf.id}
                style={{
                  backgroundColor: 'white',
                  padding: '1.5rem',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: '600',
                    }}
                  >
                    {wf.name}
                  </h3>

                  <div
                    style={{
                      fontSize: '0.875rem',
                      color: '#6b7280',
                      marginTop: '0.25rem',
                    }}
                  >
                    Updated{' '}
                    {formatDistanceToNow(
                      new Date(wf.updated_at)
                    )}{' '}
                    ago
                  </div>

                  {lastRun && (
                    <div
                      style={{
                        marginTop: '0.5rem',
                        fontSize: '0.875rem',
                      }}
                    >
                      Last run:{' '}
                      <span
                        style={{
                          fontWeight: '500',
                          color:
                            lastRun.status === 'failed'
                              ? 'red'
                              : lastRun.status === 'completed'
                              ? 'green'
                              : 'orange',
                        }}
                      >
                        {lastRun.status}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <Link
                    href={`/workflows/${wf.id}`}
                    style={{
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      padding: '0.5rem 1rem',
                      borderRadius: '4px',
                      textDecoration: 'none',
                    }}
                  >
                    {canCreate
                      ? 'Edit / Open'
                      : 'Open (View Only)'}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}