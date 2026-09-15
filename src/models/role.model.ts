// =============================================================================
// InteriorOS Backend — Role & Permission Models
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

// ── Permission Model ─────────────────────────────────────────────────────────

export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'approve' | 'export' | 'manage';

export type ModuleName =
  | 'dashboard'
  | 'projects'
  | 'wbs'
  | 'tasks'
  | 'milestones'
  | 'dpr'
  | 'weekly_reports'
  | 'procurement'
  | 'purchase_orders'
  | 'vendors'
  | 'drawings'
  | 'rfis'
  | 'mom'
  | 'risks'
  | 'snags'
  | 'ncrs'
  | 'utilities'
  | 'photos'
  | 'handover'
  | 'boq'
  | 'change_requests'
  | 'variation_orders'
  | 'users'
  | 'roles'
  | 'organization'
  | 'reports'
  | 'notifications'
  | 'settings'
  | 'audit_logs'
  | 'filemgt'
  | 'financials'
  | 'crm_leads'
  | 'crm_followups'
  | 'crm_site_visits'
  | 'crm_requirements'
  | 'crm_drawings'
  | 'crm_boq'
  | 'crm_quotations';

export interface IPermission {
  module: ModuleName;
  actions: PermissionAction[];
}

// ── Role Model ───────────────────────────────────────────────────────────────

export interface IRole extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  permissions: IPermission[];
  isSystem: boolean; // System roles can't be deleted
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PermissionSchema = new Schema<IPermission>(
  {
    module: {
      type: String,
      required: true,
      enum: [
        'dashboard', 'projects', 'wbs', 'tasks', 'milestones',
        'dpr', 'weekly_reports', 'procurement', 'purchase_orders',
        'vendors', 'drawings', 'rfis', 'mom', 'risks', 'snags',
        'ncrs', 'utilities', 'photos', 'handover', 'boq', 'change_requests', 'variation_orders', 'users',
        'roles', 'organization', 'reports', 'notifications',
        'settings', 'audit_logs', 'filemgt', 'financials',
        'crm_leads', 'crm_followups', 'crm_site_visits',
        'crm_requirements', 'crm_drawings', 'crm_boq', 'crm_quotations',
      ],
    },
    actions: [{
      type: String,
      enum: ['create', 'read', 'update', 'delete', 'approve', 'export', 'manage'],
    }],
  },
  { _id: false }
);

const RoleSchema = new Schema<IRole>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Role name is required'],
      trim: true,
      maxlength: 50,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    description: { type: String, trim: true, maxlength: 200 },
    permissions: [PermissionSchema],
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
RoleSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
RoleSchema.index({ organizationId: 1, isActive: 1 });

// Soft delete filter
RoleSchema.pre('find', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

RoleSchema.pre('findOne', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

export const Role: Model<IRole> =
  mongoose.models.Role || mongoose.model<IRole>('Role', RoleSchema);

// ── Default System Roles Template ────────────────────────────────────────────

const allModules: ModuleName[] = [
  'dashboard', 'projects', 'wbs', 'tasks', 'milestones',
  'dpr', 'weekly_reports', 'procurement', 'purchase_orders',
  'vendors', 'drawings', 'rfis', 'mom', 'risks', 'snags',
  'ncrs', 'utilities', 'photos', 'handover', 'boq', 'change_requests', 'variation_orders', 'users',
  'roles', 'organization', 'reports', 'notifications',
  'settings', 'audit_logs', 'filemgt', 'financials',
  'crm_leads', 'crm_followups', 'crm_site_visits',
  'crm_requirements', 'crm_drawings', 'crm_boq', 'crm_quotations',
];

const allActions: PermissionAction[] = ['create', 'read', 'update', 'delete', 'approve', 'export', 'manage'];
const readOnly: PermissionAction[] = ['read'];
const standardActions: PermissionAction[] = ['create', 'read', 'update'];

export const DEFAULT_ROLES = {
  admin: {
    name: 'Admin',
    slug: 'admin',
    description: 'Full access to all modules and CRM pipeline stages',
    permissions: allModules.map(module => ({ module, actions: allActions })),
    isSystem: true,
  },
  project_manager: {
    name: 'Project Manager',
    slug: 'project-manager',
    description: 'Manage projects and all CRM pipeline stages',
    permissions: allModules
      .filter(m => !['organization', 'roles', 'settings', 'audit_logs'].includes(m))
      .map(module => ({ module, actions: standardActions.concat(['approve', 'export', 'manage']) })),
    isSystem: true,
  },
  sales_executive: {
    name: 'Sales / CRM Executive',
    slug: 'sales-executive',
    description: 'Manage CRM leads, follow-ups, quotes, and project conversion',
    permissions: [
      { module: 'dashboard' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'crm_leads' as ModuleName, actions: ['create', 'read', 'update', 'export', 'manage'] as PermissionAction[] },
      { module: 'crm_followups' as ModuleName, actions: allActions },
      { module: 'crm_site_visits' as ModuleName, actions: standardActions.concat(['manage']) },
      { module: 'crm_requirements' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'crm_drawings' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'crm_boq' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'crm_quotations' as ModuleName, actions: standardActions.concat(['export', 'manage', 'approve']) },
    ],
    isSystem: true,
  },
  designer: {
    name: 'Designer / Architect',
    slug: 'designer',
    description: 'Manage 2D/3D design files and room requirements',
    permissions: [
      { module: 'dashboard' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'projects' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'drawings' as ModuleName, actions: allActions },
      { module: 'crm_leads' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'crm_site_visits' as ModuleName, actions: standardActions },
      { module: 'crm_requirements' as ModuleName, actions: standardActions.concat(['manage']) },
      { module: 'crm_drawings' as ModuleName, actions: allActions },
      { module: 'crm_boq' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'crm_quotations' as ModuleName, actions: ['read' as PermissionAction] },
    ],
    isSystem: true,
  },
  quantity_surveyor: {
    name: 'Quantity Surveyor',
    slug: 'quantity-surveyor',
    description: 'Manage BOQ estimation, material rates, and quotations',
    permissions: [
      { module: 'dashboard' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'projects' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'boq' as ModuleName, actions: allActions },
      { module: 'procurement' as ModuleName, actions: standardActions },
      { module: 'crm_leads' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'crm_requirements' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'crm_drawings' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'crm_boq' as ModuleName, actions: allActions },
      { module: 'crm_quotations' as ModuleName, actions: standardActions.concat(['export', 'approve']) },
    ],
    isSystem: true,
  },
  site_engineer: {
    name: 'Site Engineer',
    slug: 'site-engineer',
    description: 'Perform site survey, log dimensions, manage DPR and site photos',
    permissions: [
      { module: 'dashboard' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'projects' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'dpr' as ModuleName, actions: standardActions },
      { module: 'photos' as ModuleName, actions: allActions },
      { module: 'crm_leads' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'crm_followups' as ModuleName, actions: standardActions },
      { module: 'crm_site_visits' as ModuleName, actions: allActions },
      { module: 'crm_requirements' as ModuleName, actions: ['read' as PermissionAction] },
    ],
    isSystem: true,
  },
  sub_contractor: {
    name: 'Sub Contractor',
    slug: 'sub-contractor',
    description: 'Assigned execution tasks & limited drawing view',
    permissions: [
      { module: 'dashboard' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'projects' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'tasks' as ModuleName, actions: standardActions },
      { module: 'drawings' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'dpr' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'rfis' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'photos' as ModuleName, actions: ['read' as PermissionAction] },
      { module: 'filemgt' as ModuleName, actions: ['read' as PermissionAction] },
    ],
    isSystem: true,
  },
  client_representative: {
    name: 'Client Representative',
    slug: 'client-representative',
    description: 'Read-only stakeholder oversight across all stages',
    permissions: allModules
      .filter(m => !['roles', 'settings', 'audit_logs'].includes(m))
      .map(module => ({ module, actions: readOnly })),
    isSystem: true,
  },
  viewer: {
    name: 'Viewer',
    slug: 'viewer',
    description: 'Read-only access across all modules',
    permissions: allModules
      .filter(m => !['roles', 'settings', 'audit_logs'].includes(m))
      .map(module => ({ module, actions: readOnly })),
    isSystem: true,
  },
};

export default Role;
