// =============================================================================
// InteriorOS Backend — One-time permission backfill per organization
// Built-in roles and project members saved before a module existed (BOQ,
// inventory, change requests, confirm order…) don't list it, so enforcing that
// module would lock everyone out. Each version below adds its modules ONCE per
// record (tracked by `defaultsVersion`), so later edits by an admin are never
// undone. New records are created at the current version.
// =============================================================================

import { connectDB } from '@/lib/db';
import { Role, DEFAULT_ROLES } from '@/models/role.model';
import { ProjectMember } from '@/models/project-member.model';
import {
  getDefaultPermissionsForRole,
  LATE_PROJECT_MODULES,
  V2_PROJECT_MODULES,
  type ProjectRole,
} from '@/lib/project-permissions';
import type { IPermission, ModuleName } from '@/models/role.model';

export const DEFAULTS_VERSION = 2;

// What each version adds. Version 1 backfilled every module missing from the
// built-in roles' defaults; later versions only touch the modules they introduce.
const STEPS: { version: number; roleModules: ModuleName[] | 'all'; memberModules: ModuleName[] }[] = [
  { version: 1, roleModules: 'all', memberModules: LATE_PROJECT_MODULES },
  { version: 2, roleModules: V2_PROJECT_MODULES, memberModules: V2_PROJECT_MODULES },
];

const syncedOrgs = new Set<string>(); // per server process

function missingFrom(current: IPermission[] | undefined, wanted: IPermission[]): IPermission[] {
  const have = new Set((current || []).map((p) => p.module));
  return wanted
    .filter((p) => !have.has(p.module))
    .map((p) => ({ module: p.module, actions: [...p.actions] }));
}

const notYetAt = { $or: [{ defaultsVersion: { $exists: false } }, { defaultsVersion: { $lt: DEFAULTS_VERSION } }] };
const stepsAfter = (version: number | undefined) => STEPS.filter((s) => s.version > (version ?? 0));

export async function ensureOrgPermissionDefaults(organizationId: string | undefined | null): Promise<void> {
  const orgId = organizationId ? String(organizationId) : '';
  if (!orgId || syncedOrgs.has(orgId)) return;
  syncedOrgs.add(orgId);

  try {
    await connectDB();

    // Built-in org roles → add modules from the current defaults
    const roles = await Role.find({ organizationId: orgId, isSystem: true, ...notYetAt })
      .select('slug permissions defaultsVersion')
      .lean();
    const roleOps = roles.map((role) => {
      const def = Object.values(DEFAULT_ROLES).find((d) => d.slug === role.slug);
      const defaults = (def?.permissions || []) as IPermission[];
      let current = (role.permissions || []) as IPermission[];
      const add: IPermission[] = [];
      for (const step of stepsAfter(role.defaultsVersion)) {
        const wanted = step.roleModules === 'all' ? defaults : defaults.filter((p) => (step.roleModules as ModuleName[]).includes(p.module));
        const more = missingFrom(current, wanted);
        add.push(...more);
        current = [...current, ...more];
      }
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

    // Project members with copied (not role-linked) permissions → add new modules from their preset
    const members = await ProjectMember.find({ organizationId: orgId, ...notYetAt })
      .select('projectRole roleId permissions defaultsVersion')
      .lean();
    const memberOps = members.map((m) => {
      const preset = getDefaultPermissionsForRole(m.projectRole as ProjectRole);
      let current = (m.permissions || []) as IPermission[];
      const add: IPermission[] = [];
      if (!m.roleId) {
        for (const step of stepsAfter(m.defaultsVersion)) {
          const more = missingFrom(current, preset.filter((p) => step.memberModules.includes(p.module)));
          add.push(...more);
          current = [...current, ...more];
        }
      }
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

