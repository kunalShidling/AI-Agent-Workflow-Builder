import { pool, query } from '../utils/db';

/**
 * Creates a new organization and assigns the creator as the 'owner'.
 */
export async function createOrganization(userId: string, name: string) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create org with default 100 calls allowed
    const orgRes = await client.query(
      `INSERT INTO organizations (name, calls_allowed) VALUES ($1, 100) RETURNING id`,
      [name]
    );
    const orgId = orgRes.rows[0].id;
    
    // Add creator as owner
    await client.query(
      `INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [orgId, userId]
    );
    
    await client.query('COMMIT');
    return { id: orgId, name };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Adds a new member to an organization.
 * Enforces Layer 1 Security: The caller must be an 'owner' of the organization.
 */
export async function addMemberToOrganization(
  callerUserId: string, 
  orgId: string, 
  targetUserId: string, 
  role: 'owner' | 'editor' | 'viewer'
) {
  // Layer 1 Security: Verify caller is 'owner' of this org
  const authCheck = await query(
    `SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2`,
    [orgId, callerUserId]
  );
  
  if (authCheck.rowCount === 0 || authCheck.rows[0].role !== 'owner') {
    throw new Error('Unauthorized: Only organization owners can add members.');
  }

  // Insert or update member
  await query(
    `INSERT INTO org_members (org_id, user_id, role) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (org_id, user_id) 
     DO UPDATE SET role = EXCLUDED.role`,
    [orgId, targetUserId, role]
  );

  return { success: true };
}
