// =============================================================================
// InteriorOS Backend — sidebar sections a user can open (navAccess)
//
// Shared by /auth/login and /auth/me so both return the SAME user shape. (They
// differed before: login had no navAccess, so the web app saw a "permission
// change" on the first refresh after every login and re-mounted the page.)
// =============================================================================

import type { JwtPayload } from '@/lib/jwt';
import { canAny, canOnAnyRole } from '@/lib/rbac';
import { CRM_MODULES } from '@/lib/crm-access';

export interface NavAccess {
  dashboard: boolean;
  crm: boolean;
  projects: boolean;
  vendors: boolean;
  usersRoles: boolean;
  audit: boolean;
}

export async function computeNavAccess(auth: Pick<JwtPayload, 'userId' | 'organizationId' | 'systemRole'>): Promise<NavAccess> {
  const a = auth as JwtPayload;
  // Independent checks (each cached in lib/rbac): run them together, not one after another
  const [dashboard, crm, projects, vendors, roles, users, audit] = await Promise.all([
    canAny(a, ['dashboard'], 'read'),
    canAny(a, CRM_MODULES, 'read'),
    canOnAnyRole(a, 'projects', 'read'),
    canAny(a, ['vendors'], 'read'),
    canAny(a, ['roles'], 'read'),
    canAny(a, ['users'], 'read'),
    canAny(a, ['audit_logs'], 'read'),
  ]);
  return { dashboard, crm, projects, vendors, usersRoles: roles || users, audit };
}
