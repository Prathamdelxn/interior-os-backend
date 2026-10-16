// =============================================================================
// InteriorOS Backend — Role-Based Access Control (shared permission resolution)
//
// Same model as the construction app:
//   • Org admins (systemRole super_admin / org_admin) can do everything.
//   • A user's GLOBAL role (User.role) applies everywhere.
//   • Inside a project, the user's PROJECT role adds to that: the org Role
//     linked on their ProjectMember (roleId), or — for older members without
//     a linked role — the permissions copied onto the membership.
// A permission is a module + action; the `manage` action implies every action.
// =============================================================================

import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { User } from '@/models/user.model';
import { ProjectMember } from '@/models/project-member.model';
import type { JwtPayload } from '@/lib/jwt';
import { ensureOrgPermissionDefaults } from '@/lib/role-defaults';
import type { IPermission, ModuleName, PermissionAction } from '@/models/role.model';

type PermissionList = Pick<IPermission, 'module' | 'actions'>[] | undefined | null;

export function isOrgAdmin(auth: JwtPayload): boolean {
  return auth.systemRole === 'super_admin' || auth.systemRole === 'org_admin';
}

/** True if the permission list grants `action` on `module` (`manage` grants all). */
export function permissionListAllows(perms: PermissionList, module: ModuleName, action: PermissionAction): boolean {
  if (!Array.isArray(perms)) return false;
  const entry = perms.find((p) => p.module === module);
  if (!entry) return false;
  return entry.actions.includes(action) || entry.actions.includes('manage');
}

/** Permissions from the user's global (org-level) role. */
export async function getGlobalPermissions(userId: string): Promise<PermissionList> {
  await connectDB();
  const user = await User.findById(userId).populate('role').select('role');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = user?.role as any;
  return role && typeof role === 'object' ? role.permissions : [];
}

/** Permissions the user has on one project (linked role, else copied preset). Null if not a member. */
export async function getProjectPermissions(
  userId: string,
  projectId: string,
  organizationId: string
): Promise<PermissionList> {
  if (!mongoose.isValidObjectId(projectId)) return null;
  await connectDB();
  const member = await ProjectMember.findOne({
    projectId,
    userId,
    organizationId,
    isDeleted: false,
  }).populate('roleId');
  if (!member) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkedRole = member.roleId as any;
  if (linkedRole && typeof linkedRole === 'object' && Array.isArray(linkedRole.permissions)) {
    return linkedRole.permissions;
  }
  return member.permissions;
}

/**
 * Can this user perform `action` on `module`?
 * - Admin → always.
 * - Org level (no projectId) → the global role decides.
 * - Inside a project → the user must be a MEMBER of that project; then the
 *   global role and the project role are combined. (Unlike construction, the
 *   global role alone never opens a project — every interior user has a
 *   global role, and roles like Client Representative / Viewer grant read on
 *   everything, which would expose other clients' projects.)
 */
export async function can(
  auth: JwtPayload,
  module: ModuleName,
  action: PermissionAction,
  projectId?: string | null
): Promise<boolean> {
  if (isOrgAdmin(auth)) return true;
  await ensureOrgPermissionDefaults(auth.organizationId);
  if (!projectId) {
    return permissionListAllows(await getGlobalPermissions(auth.userId), module, action);
  }
  const projectPerms = await getProjectPermissions(auth.userId, projectId, String(auth.organizationId));
  if (projectPerms === null) return false; // not a member of this project
  if (permissionListAllows(projectPerms, module, action)) return true;
  return permissionListAllows(await getGlobalPermissions(auth.userId), module, action);
}

/**
 * Project ids (as strings) whose project-level `module:action` the user has —
 * membership required, org role + project role combined (same rules as `can`).
 */
export async function projectIdsAllowing(
  auth: JwtPayload,
  module: ModuleName,
  action: PermissionAction
): Promise<string[]> {
  await connectDB();
  const memberships = await ProjectMember.find({
    userId: auth.userId,
    organizationId: auth.organizationId,
    isDeleted: false,
  })
    .select('projectId roleId permissions')
    .populate('roleId', 'permissions');
  const globalAllows = permissionListAllows(await getGlobalPermissions(auth.userId), module, action);
  return memberships
    .filter((m) => {
      if (globalAllows) return true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linkedRole = m.roleId as any;
      const perms = linkedRole && typeof linkedRole === 'object' ? linkedRole.permissions : m.permissions;
      return permissionListAllows(perms, module, action);
    })
    .map((m) => String(m.projectId));
}

/** True if the global role allows `action` on at least one of `modules` (e.g. any CRM stage). */
export async function canAny(auth: JwtPayload, modules: ModuleName[], action: PermissionAction): Promise<boolean> {
  if (isOrgAdmin(auth)) return true;
  await ensureOrgPermissionDefaults(auth.organizationId);
  const perms = await getGlobalPermissions(auth.userId);
  return modules.some((m) => permissionListAllows(perms, m, action));
}

/** Org-wide modules (CRM, templates, vendors…): the global role or ANY project role counts. */
export async function canOnAnyRole(auth: JwtPayload, module: ModuleName, action: PermissionAction): Promise<boolean> {
  if (isOrgAdmin(auth)) return true;
  if (permissionListAllows(await getGlobalPermissions(auth.userId), module, action)) return true;
  await connectDB();
  const memberships = await ProjectMember.find({
    userId: auth.userId,
    organizationId: auth.organizationId,
    isDeleted: false,
  }).populate('roleId');
  return memberships.some((m) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkedRole = m.roleId as any;
    const perms = linkedRole && typeof linkedRole === 'object' ? linkedRole.permissions : m.permissions;
    return permissionListAllows(perms, module, action);
  });
}

const PROJECT_ROLE_KEYS = ['project_manager', 'site_engineer', 'quantity_surveyor', 'designer', 'client_representative', 'sub_contractor', 'viewer'] as const;
type ProjectRoleKey = (typeof PROJECT_ROLE_KEYS)[number];

/**
 * Resolve an org Role to use as someone's PROJECT role. Returns the fields to
 * store on the ProjectMember: the link (roleId), a copy of its permissions
 * (fallback if the link is ever lost) and the matching preset label when the
 * role is one of the built-in ones. Null if the role isn't in this org.
 */
export async function resolveProjectRole(
  organizationId: string,
  roleId: string
): Promise<{ roleId: mongoose.Types.ObjectId; projectRole: ProjectRoleKey; permissions: IPermission[] } | null> {
  if (!mongoose.isValidObjectId(roleId)) return null;
  await connectDB();
  const { Role } = await import('@/models/role.model');
  const role = await Role.findOne({ _id: roleId, organizationId, isDeleted: false });
  if (!role) return null;
  const key = String(role.slug || '').replace(/-/g, '_');
  const projectRole = (PROJECT_ROLE_KEYS as readonly string[]).includes(key) ? (key as ProjectRoleKey) : 'viewer';
  return { roleId: role._id, projectRole, permissions: role.permissions };
}

/** Union of permission lists (module → combined actions). */
export function mergePermissions(...lists: PermissionList[]): IPermission[] {
  const byModule = new Map<string, Set<PermissionAction>>();
  for (const list of lists) {
    for (const p of list || []) {
      const set = byModule.get(p.module) || new Set<PermissionAction>();
      p.actions.forEach((a) => set.add(a));
      byModule.set(p.module, set);
    }
  }
  return [...byModule.entries()].map(([module, actions]) => ({ module: module as ModuleName, actions: [...actions] }));
}
