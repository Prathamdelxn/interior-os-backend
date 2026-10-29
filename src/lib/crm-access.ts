// =============================================================================
// InteriorOS Backend — CRM stage permissions
// A CRM customer moves through stages (lead → site visit → requirements →
// drawings → BOQ → quotation). Each stage has its own Role module, so the
// module to check depends on what is being changed.
// =============================================================================

import type { JwtPayload } from '@/lib/jwt';
import type { ModuleName, PermissionAction } from '@/models/role.model';
import { canAny } from '@/lib/rbac';

export const CRM_MODULES: ModuleName[] = [
  'crm_leads',
  'crm_followups',
  'crm_requirements',
  'crm_site_visits',
  'crm_drawings',
  'crm_boq',
  'crm_quotations',
];

/** CRM module that owns a pipeline status (stage). */
export function crmModuleForStatus(status?: string | null): ModuleName {
  switch (status) {
    case 'Contacted':
    case 'Meeting Scheduled':
      return 'crm_followups';
    case 'Under Site Visit':
    case 'Measurement Done':
      return 'crm_site_visits';
    case 'Under Requirement':
    case 'Requirement Completed':
      return 'crm_requirements';
    case 'Under Drawing':
    case 'Design Approved':
      return 'crm_drawings';
    case 'Under BOQ Creation':
      return 'crm_boq';
    case 'Under Quotation':
    case 'Quotation Pending':
    case 'Quotation Sent':
    case 'Negotiation':
    case 'Booking Pending':
    case 'Won':
    case 'Converted':
      return 'crm_quotations';
    default:
      // New Lead, Lost, Reopened…
      return 'crm_leads';
  }
}

/** CRM module that owns an activity type (follow-up, site visit, drawing review…). */
export function crmModuleForActivityType(type?: string | null): ModuleName | null {
  switch (type) {
    case 'Site Visit':
    case 'Site Survey':
      return 'crm_site_visits';
    case 'Requirement Gathering':
      return 'crm_requirements';
    case '2D/3D Drawing':
    case 'Drawing Review':
    case 'Drawing Approval':
    case 'Design Shared':
      return 'crm_drawings';
    case 'Status Change':
    case 'System Update':
      return null; // automatic log written alongside a stage change
    default:
      return 'crm_followups'; // calls, WhatsApp, meetings, emails
  }
}

// Customer fields owned by a specific stage
const STAGE_FIELDS: Record<string, ModuleName> = {
  siteMeasurements: 'crm_site_visits',
  sitePhotos: 'crm_site_visits',
  siteVisitScheduledDate: 'crm_site_visits',
  requirements: 'crm_requirements',
  clientRequirements: 'crm_requirements',
  clientRequirementsSubmittedAt: 'crm_requirements',
  clientRequirementsNotes: 'crm_requirements',
  designs: 'crm_drawings',
  designFiles: 'crm_drawings',
  boqs: 'crm_boq',
  quotations: 'crm_quotations',
  confirmedOrder: 'crm_quotations',
  futureFollowUpDate: 'crm_followups',
};

// Lists where adding / removing an entry is a create / delete (BOQ versions, quotations, design files)
const LIST_FIELDS = new Set(['boqs', 'quotations', 'designs', 'designFiles', 'requirements']);

// Notes that travel with any stage form
const SHARED_FIELDS = new Set(['remarks', 'status']);

// Who a stage is handed to — set when a lead is passed on, so it rides along with the move
const HANDOFF_FIELDS = new Set(['assignedSalesExecutive', 'designerAssigned']);

/** Which action a change to a stage field amounts to. */
function actionForField(key: string, before: unknown, after: unknown): PermissionAction {
  if (!LIST_FIELDS.has(key)) return 'update';
  const prev = Array.isArray(before) ? before : [];
  const next = Array.isArray(after) ? after : [];
  if (next.length > prev.length) return 'create';
  // Requirements have no Delete permission — removing a row is part of editing them
  if (next.length < prev.length) return key === 'requirements' ? 'update' : 'delete';
  if (key === 'boqs') {
    // A BOQ version moving to approved / rejected is an approval decision
    const decided = next.some((b: any, i: number) => {
      const was = (prev[i] as any)?.status;
      return b?.status !== was && (b?.status === 'approved' || b?.status === 'rejected');
    });
    if (decided) return 'approve';
  }
  if (key === 'quotations') {
    // Marking a quotation client-approved (Accepted) or Rejected is an approval decision
    const decided = next.some((q: any, i: number) => {
      const was = (prev[i] as any)?.status;
      return q?.status !== was && (q?.status === 'Accepted' || q?.status === 'Rejected');
    });
    if (decided) return 'approve';
  }
  return 'update';
}

type CustomerSnapshot = Record<string, unknown> & { status?: string };

/**
 * May this user apply `update` to a customer (each CRM stage has its own permission)?
 * - Moving a lead INTO a stage is creating it there: `create` on that stage, or
 *   `update` on the current / target stage (whoever finishes a stage can hand it on).
 * - Stage data needs the matching action on its stage: adding a BOQ / quotation /
 *   design is `create`, removing one `delete`, approving or rejecting a BOQ `approve`,
 *   anything else `update`. While a lead is being moved into a stage, `create` there
 *   also covers that stage's data.
 * - Lead details (name, phone, priority…) need `crm_leads: update`; assignees sent
 *   with a stage move or stage form don't.
 */
export async function canUpdateCustomer(
  auth: JwtPayload,
  existing: CustomerSnapshot,
  update: Record<string, unknown>
): Promise<{ ok: boolean; module?: ModuleName; action?: PermissionAction }> {
  const keys = Object.keys(update).filter((k) => update[k] !== undefined);
  const currentStatus = existing.status;
  const movesStage = typeof update.status === 'string' && update.status !== currentStatus;
  const from = crmModuleForStatus(currentStatus);
  const to = movesStage ? crmModuleForStatus(update.status as string) : null;

  if (movesStage && to) {
    const allowed = (await canAny(auth, [to], 'create')) || (await canAny(auth, [from, to], 'update'));
    if (!allowed) return { ok: false, module: to, action: 'create' };
  }

  let hasStageData = false;
  let touchesLeadDetails = false;
  for (const k of keys) {
    const m = STAGE_FIELDS[k];
    if (m) {
      hasStageData = true;
      const action = actionForField(k, existing[k], update[k]);
      const enteringThisStage = m === to && (await canAny(auth, [m], 'create'));
      // Scheduling another follow-up (its date) is creating a follow-up, not editing the lead
      const schedulingFollowUp = k === 'futureFollowUpDate' && (await canAny(auth, [m], 'create'));
      if (!enteringThisStage && !schedulingFollowUp && !(await canAny(auth, [m], action))) return { ok: false, module: m, action };
    } else if (!SHARED_FIELDS.has(k) && !HANDOFF_FIELDS.has(k)) {
      touchesLeadDetails = true;
    }
  }

  if (touchesLeadDetails && !hasStageData && !movesStage) {
    if (!(await canAny(auth, ['crm_leads'], 'update'))) return { ok: false, module: 'crm_leads', action: 'update' };
  }

  // Only notes / an assignee → any CRM stage the user can update
  if (!hasStageData && !touchesLeadDetails && !movesStage) {
    if (!(await canAny(auth, CRM_MODULES, 'update'))) return { ok: false, module: 'crm_leads', action: 'update' };
  }
  return { ok: true };
}

export function crmDeniedMessage(module: ModuleName | undefined, action: PermissionAction = 'update'): string {
  const labels: Record<string, string> = {
    crm_leads: 'leads',
    crm_followups: 'follow-ups',
    crm_site_visits: 'site visits',
    crm_requirements: 'requirements',
    crm_drawings: 'drawings',
    crm_boq: 'BOQs',
    crm_quotations: 'quotations',
  };
  return `You don't have permission to ${action} ${labels[module || ''] || 'this CRM stage'}`;
}
