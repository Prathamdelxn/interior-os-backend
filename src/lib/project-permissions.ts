// =============================================================================
// InteriorOS Backend — Default Project-Level Permission Presets
// =============================================================================

import type { PermissionAction, ModuleName, IPermission } from '@/models/role.model';

// ── Shorthand helpers ────────────────────────────────────────────────────────

const full: PermissionAction[] = ['create', 'read', 'update', 'delete', 'approve', 'export', 'manage'];
const crud: PermissionAction[] = ['create', 'read', 'update', 'delete'];
const readOnly: PermissionAction[] = ['read'];
const ownOnly: PermissionAction[] = ['read', 'update']; // For "own-assigned" scope
const raise: PermissionAction[] = ['create', 'read', 'update']; // Raise / edit, no delete or approve

function perm(module: ModuleName, actions: PermissionAction[]): IPermission {
  return { module, actions };
}

// ── All modules in the system ────────────────────────────────────────────────

export const PROJECT_MODULES: { module: ModuleName; label: string }[] = [
  { module: 'projects', label: 'Project Config' },
  { module: 'wbs', label: 'WBS Hierarchy' },
  { module: 'tasks', label: 'Tasks' },
  { module: 'milestones', label: 'Milestones' },
  { module: 'dpr', label: 'Daily Progress Report' },
  { module: 'weekly_reports', label: 'Weekly Reports' },
  { module: 'procurement', label: 'Procurement' },
  { module: 'purchase_orders', label: 'Purchase Orders' },
  { module: 'vendors', label: 'Vendors' },
  { module: 'drawings', label: 'Drawings' },
  { module: 'rfis', label: 'RFIs' },
  { module: 'mom', label: 'Minutes of Meeting' },
  { module: 'risks', label: 'Risks' },
  { module: 'snags', label: 'Snags' },
  { module: 'ncrs', label: 'NCRs' },
  { module: 'utilities', label: 'Utilities' },
  { module: 'photos', label: 'Site Photos' },
  { module: 'handover', label: 'Handover' },
  { module: 'users', label: 'Team / Members' },
  { module: 'filemgt', label: 'File Management' },
  { module: 'financials', label: 'Payments & Financials' },
  { module: 'boq', label: 'BOQ' },
  { module: 'quotation', label: 'Quotation' },
  { module: 'inventory', label: 'Inventory' },
  { module: 'change_requests', label: 'Change Requests' },
  { module: 'variation_orders', label: 'Variation Orders' },
];

/** Modules added to the presets after members were already created (see roles/sync-defaults). */
export const LATE_PROJECT_MODULES: ModuleName[] = ['boq', 'quotation', 'inventory', 'change_requests', 'variation_orders'];

// ── Default permission presets per project role ──────────────────────────────

export type ProjectRole =
  | 'project_manager'
  | 'site_engineer'
  | 'quantity_surveyor'
  | 'designer'
  | 'sub_contractor'
  | 'client_representative'
  | 'viewer';

export const DEFAULT_PROJECT_PERMISSIONS: Record<ProjectRole, IPermission[]> = {
  // ── Project Manager: Full access to everything ──
  project_manager: [
    perm('projects', full),
    perm('wbs', full),
    perm('tasks', full),
    perm('milestones', full),
    perm('dpr', full),
    perm('weekly_reports', full),
    perm('procurement', full),
    perm('purchase_orders', full),
    perm('vendors', full),
    perm('drawings', full),
    perm('rfis', full),
    perm('mom', full),
    perm('risks', full),
    perm('snags', full),
    perm('ncrs', full),
    perm('utilities', full),
    perm('photos', full),
    perm('handover', full),
    perm('users', full),
    perm('filemgt', full),
    perm('financials', full),
    perm('boq', full),
    perm('quotation', full),
    perm('inventory', full),
    perm('change_requests', full),
    perm('variation_orders', full),
  ],

  // ── Site Engineer: Field-focused CRUD + own tasks ──
  site_engineer: [
    perm('projects', readOnly),
    perm('wbs', readOnly),
    perm('tasks', ownOnly),        // Can only view/update tasks assigned to them
    perm('milestones', readOnly),
    perm('dpr', crud),
    perm('weekly_reports', crud),
    perm('procurement', readOnly),
    perm('purchase_orders', readOnly),
    perm('vendors', readOnly),
    perm('drawings', readOnly),
    perm('rfis', crud),
    perm('mom', crud),
    perm('risks', crud),
    perm('snags', crud),
    perm('ncrs', crud),
    perm('utilities', crud),
    perm('photos', crud),
    perm('handover', readOnly),
    perm('users', readOnly),
    perm('filemgt', crud),
    perm('financials', readOnly),
    perm('boq', readOnly),
    perm('inventory', crud),
    perm('change_requests', raise),
    perm('variation_orders', readOnly),
  ],

  // ── Quantity Surveyor: Procurement/POs/Utilities focused ──
  quantity_surveyor: [
    perm('projects', readOnly),
    perm('wbs', readOnly),
    perm('tasks', readOnly),
    perm('milestones', readOnly),
    perm('dpr', readOnly),
    perm('weekly_reports', readOnly),
    perm('procurement', crud),
    perm('purchase_orders', crud),
    perm('vendors', crud),
    perm('drawings', readOnly),
    perm('rfis', readOnly),
    perm('mom', readOnly),
    perm('risks', readOnly),
    perm('snags', readOnly),
    perm('ncrs', readOnly),
    perm('utilities', crud),
    perm('photos', readOnly),
    perm('handover', readOnly),
    perm('filemgt', crud),
    perm('financials', crud),
    perm('boq', crud),
    perm('quotation', crud),
    perm('inventory', crud),
    perm('change_requests', readOnly),
    perm('variation_orders', crud),
  ],

  // ── Designer: Drawings/RFIs/Photos focused ──
  designer: [
    perm('projects', readOnly),
    perm('wbs', readOnly),
    perm('tasks', readOnly),
    perm('milestones', readOnly),
    perm('drawings', crud),
    perm('rfis', crud),
    perm('mom', readOnly),
    perm('risks', readOnly),
    perm('snags', readOnly),
    perm('ncrs', readOnly),
    perm('photos', crud),
    perm('handover', readOnly),
    perm('filemgt', crud),
    perm('financials', readOnly),
    perm('boq', readOnly),
    perm('change_requests', raise),
    perm('variation_orders', readOnly),
  ],

  // ── Sub Contractor: Own tasks + limited read ──
  sub_contractor: [
    perm('projects', readOnly),
    perm('tasks', ownOnly),        // Can only view/update tasks assigned to them
    perm('dpr', readOnly),
    perm('procurement', readOnly),
    perm('purchase_orders', readOnly),
    perm('drawings', readOnly),
    perm('rfis', readOnly),
    perm('snags', readOnly),
    perm('ncrs', readOnly),
    perm('photos', readOnly),
    perm('filemgt', readOnly),
    perm('financials', readOnly),
    perm('inventory', readOnly),
  ],

  // ── Client Representative: Read-heavy + project config read ──
  client_representative: [
    perm('projects', readOnly),
    perm('wbs', readOnly),
    perm('tasks', readOnly),
    perm('milestones', readOnly),
    perm('dpr', readOnly),
    perm('weekly_reports', readOnly),
    perm('procurement', readOnly),
    perm('purchase_orders', readOnly),
    perm('vendors', readOnly),
    perm('drawings', readOnly),
    perm('rfis', readOnly),
    perm('mom', readOnly),
    perm('risks', readOnly),
    perm('snags', readOnly),
    perm('ncrs', readOnly),
    perm('utilities', readOnly),
    perm('photos', readOnly),
    perm('handover', readOnly),
    perm('filemgt', readOnly),
    perm('financials', readOnly),
    perm('boq', readOnly),
    perm('quotation', readOnly),
    perm('change_requests', ['create', 'read']),
    perm('variation_orders', readOnly),
  ],

  // ── Viewer: Read-only everywhere ──
  viewer: [
    perm('projects', readOnly),
    perm('wbs', readOnly),
    perm('tasks', readOnly),
    perm('milestones', readOnly),
    perm('dpr', readOnly),
    perm('weekly_reports', readOnly),
    perm('procurement', readOnly),
    perm('purchase_orders', readOnly),
    perm('vendors', readOnly),
    perm('drawings', readOnly),
    perm('rfis', readOnly),
    perm('mom', readOnly),
    perm('risks', readOnly),
    perm('snags', readOnly),
    perm('ncrs', readOnly),
    perm('utilities', readOnly),
    perm('photos', readOnly),
    perm('handover', readOnly),
    perm('filemgt', readOnly),
    perm('financials', readOnly),
    perm('boq', readOnly),
    perm('quotation', readOnly),
    perm('inventory', readOnly),
    perm('change_requests', readOnly),
    perm('variation_orders', readOnly),
  ],
};

/**
 * Get the default permissions for a given project role.
 * Returns a deep-cloned copy to prevent mutation.
 */
export function getDefaultPermissionsForRole(role: ProjectRole): IPermission[] {
  const preset = DEFAULT_PROJECT_PERMISSIONS[role];
  if (!preset) {
    return DEFAULT_PROJECT_PERMISSIONS.viewer;
  }
  // Deep clone to prevent mutation of the source template
  return JSON.parse(JSON.stringify(preset));
}

/**
 * All available permission actions for display purposes.
 */
export const ALL_PERMISSION_ACTIONS: PermissionAction[] = ['create', 'read', 'update', 'delete', 'approve', 'export', 'manage'];
