import { gql } from '@apollo/client';

export const GET_ORG_MEMBERSHIPS = gql`
  query GetOrgMemberships {
    org_members {
      org_id
      role
      organization {
        id
        name
        calls_used
        calls_allowed
      }
    }
  }
`;

export const GET_WORKFLOWS = gql`
  query GetWorkflows($orgId: uuid!) {
    workflows(where: { org_id: { _eq: $orgId } }, order_by: { updated_at: desc }) {
      id
      name
      description
      updated_at
      workflow_runs(order_by: { started_at: desc }, limit: 1) {
        status
      }
    }
  }
`;

export const GET_WORKFLOW = gql`
  query GetWorkflow($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      name
      description
      org_id
      workflow_steps(order_by: { step_order: asc }) {
        id
        step_order
        name
        type
        config
      }
      workflow_triggers {
        id
        trigger_type
        enabled
      }
    }
  }
`;
