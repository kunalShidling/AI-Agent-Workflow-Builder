import { query } from '../utils/db';

export async function verifyTriggerPermission(userId: string, workflowId: string) {
  // Verify authenticated user -> org_members -> owner/editor
  const res = await query(`
    SELECT om.role, w.org_id
    FROM workflows w
    JOIN org_members om ON w.org_id = om.org_id
    WHERE w.id = $1 AND om.user_id = $2
  `, [workflowId, userId]);
  
  if (res.rowCount === 0) {
    throw new Error('Unauthorized or workflow not found');
  }
  
  const role = res.rows[0].role;
  if (role !== 'owner' && role !== 'editor') {
    throw new Error('Unauthorized: only owner or editor can trigger workflows');
  }
  
  return { orgId: res.rows[0].org_id, role };
}
