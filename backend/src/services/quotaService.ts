import { query } from '../utils/db';

export async function checkAndConsumeQuota(orgId: string) {
  const res = await query(`
    UPDATE organizations
    SET calls_used = calls_used + 1
    WHERE id = $1 AND calls_used < calls_allowed
    RETURNING id
  `, [orgId]);
  
  if (res.rowCount === 0) {
    throw new Error('Quota exceeded or organization not found');
  }
}
