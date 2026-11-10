// Pure policy helpers. These do not expose an HTTP approval endpoint.
import { can } from './staffAuth.js';

export const APPROVAL_DECISIONS = Object.freeze({
  approve: 'approved', reject: 'rejected', changes: 'changes_requested'
});

export function mayDecideApproval(actor, project, decision) {
  if (!actor?.is_active || !can(actor.role, 'approve')) return false;
  if (!project || !Object.values(APPROVAL_DECISIONS).includes(decision)) return false;
  // Missing ownership (including legacy records) fails closed.
  if (!project.created_by_staff_id || !project.last_edited_by_staff_id) return false;
  if (actor.id === project.created_by_staff_id) return false;
  if (actor.id === project.last_edited_by_staff_id) return false;
  return true;
}
