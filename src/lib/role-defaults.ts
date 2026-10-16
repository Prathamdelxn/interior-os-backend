// =============================================================================
// InteriorOS Backend — One-time permission backfill per organization
// Built-in roles and project members saved before a module existed (BOQ,
// inventory, change requests…) don't list it, so enforcing that module would
// lock everyone out. This adds the missing modules ONCE per record (marked with
// `defaultsVersion`), so later edits by an admin are never undone.
// =============================================================================

import { connectDB } from '@/lib/db';
import { Role, DEFAULT_ROLES } from '@/models/role.model';
import { ProjectMember } from '@/models/project-member.model';
import { getDefaultPermissionsForRole, LATE_PROJECT_MODULES, type ProjectRole } from '@/lib/project-permissions';
import type { IPermission } from '@/models/role.model';

const DEFAULTS_VERSION = 1;
const syncedOrgs = new Set<string>(); // per server process

function missingFrom(current: IPermission[] | undefined, wanted: IPermission[]): IPermission[] {
  const have = new Set((current || []).map((p) => p.module));
  return wanted
    .filter((p) => !have.has(p.module))
    .map((p) => ({ module: p.module, actions: [...p.actions] }));
}

export async function ensureOrgPermissionDefaults(organizationId: string | undefined | null): Promise<void> {
  const orgId = organizationId ? String(organizationId) : '';
  if (!orgId || syncedOrgs.has(orgId)) return;
  syncedOrgs.add(orgId);

  try {
    await connectDB();

    // Built-in org roles → add modules from the current defaults
    const roles = await Role.find({ organizationId: orgId, isSystem: true, defaultsVersion: { $exists: false } })
      .select('slug permissions')
      .lean();
    const roleOps = roles.map((role) => {
      const def = Object.values(DEFAULT_ROLES).find((d) => d.slug === role.slug);
      const add = def ? missingFrom(role.permissions, def.permissions as IPermission[]) : [];
      return {
        updateOne: {
          filter: { _id: role._id },
          update: {
            $set: { defaultsVersion: DEFAULTS_VERSION },
            ...(add.length ? { $push: { permissions: { $each: add } } } : {}),
          },
        },
      };
    });
    if (roleOps.length) await Role.bulkWrite(roleOps);

    // Project members with copied (not role-linked) permissions → add late modules from their preset
    const members = await ProjectMember.find({ organizationId: orgId, defaultsVersion: { $exists: false } })
      .select('projectRole roleId permissions')
      .lean();
    const memberOps = members.map((m) => {
      const preset = getDefaultPermissionsForRole(m.projectRole as ProjectRole).filter((p) =>
        LATE_PROJECT_MODULES.includes(p.module)
      );
      const add = m.roleId ? [] : missingFrom(m.permissions, preset);
      return {
        updateOne: {
          filter: { _id: m._id },
          update: {
            $set: { defaultsVersion: DEFAULTS_VERSION },
            ...(add.length ? { $push: { permissions: { $each: add } } } : {}),
          },
        },
      };
    });
    if (memberOps.length) await ProjectMember.bulkWrite(memberOps);
  } catch (error) {
    syncedOrgs.delete(orgId); // retry on the next request
    console.error('Permission defaults sync failed:', error);
  }
}
