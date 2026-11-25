// =============================================================================
// InteriorOS Backend — Utilities (MEP commissioning) API Route
//
// Nothing is hard-coded per project any more:
//   • First open: systems are DETECTED from the project's own scope (linked CRM
//     lead's BOQ / quotation items, site-survey MEP notes, room requirements,
//     project BOQ items). No scope match → empty list, the team adds systems.
//   • The team can add / rename / mark N/A / remove systems and add / rename /
//     remove checkpoints. Progress is computed from passed checkpoints.
// =============================================================================

import { NextRequest } from 'next/server';
import { getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { UtilitySystem, type IUtilitySystem } from '@/models/utility.model';
import { CrmCustomer } from '@/models/crm-customer.model';
import { BOQItem } from '@/models/boq.model';
import { successResponse, createdResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api-response';
import { detectSystems, slugify, templateForLabel, type ScopeText } from '@/lib/utility-templates';
import type { JwtPayload } from '@/lib/jwt';

type Ctx = { params: Promise<Record<string, string>> };

const pct = (sys: IUtilitySystem) => {
  const total = sys.checkpoints.length;
  return total ? Math.round((sys.checkpoints.filter((c) => c.status === 'passed').length / total) * 100) : 0;
};

/**
 * What the project says about its scope, split by how much to trust it:
 *  strong = BOQ / quotation line items (the work actually priced)
 *  weak   = survey notes and room requirements (free text, room names)
 */
async function collectScope(projectId: string, organizationId: string): Promise<ScopeText> {
  const strong: string[] = [];
  const weak: string[] = [];
  const add = (to: string[]) => (...v: unknown[]) => v.forEach((x) => typeof x === 'string' && x.trim() && to.push(x));
  const S = add(strong);
  const W = add(weak);

  const lead: any = await CrmCustomer.findOne({ linkedProject: projectId, organizationId }).lean();
  if (lead) {
    const sm = lead.siteMeasurements || {};
    W(sm.electricalPoints, sm.plumbingPoints, sm.acLocations, sm.siteConstraints, sm.notes);
    (lead.requirements || []).forEach((r: any) =>
      W(r.roomName, r.electricalPoints, r.lightingRequirements, r.plumbingRequirements, r.description)
    );
    (lead.boqs || []).forEach((b: any) => {
      (b.sections || []).forEach((s: any) => { S(s.sectionTitle); W(s.scopeDescription); });
      (b.items || []).forEach((it: any) => S(it.category, it.sectionTitle, it.itemName, it.description));
    });
    const accepted = (lead.quotations || []).filter((q: any) => ['Accepted', 'Approved'].includes(q.status));
    (accepted.length ? accepted : lead.quotations || []).forEach((q: any) =>
      (q.items || []).forEach((it: any) => S(it.category, it.description))
    );
  }

  const boqItems: any[] = await BOQItem.find({ projectId, organizationId }).select('category description itemName').limit(2000).lean();
  boqItems.forEach((it) => S(it.category, it.description, it.itemName));
  return { strong: strong.join(' \n '), weak: weak.join(' \n ') };
}

// GET: list systems; detect them from scope the first time the project opens this tab
async function getUtilitiesHandler(_req: NextRequest, context: Ctx, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;

    // Seed only once per project (soft-deleted rows count, so removing everything stays removed).
    const everCreated = await UtilitySystem.countDocuments({ projectId, organizationId, isDeleted: { $in: [true, false] } });
    if (everCreated === 0) {
      const detected = detectSystems(await collectScope(projectId, organizationId));
      await Promise.all(
        detected.map((t, i) =>
          UtilitySystem.create({
            projectId,
            organizationId,
            system: t.key,
            label: t.label,
            source: 'auto',
            order: i,
            plannedProgress: 100,
            actualProgress: 0,
            checkpoints: t.checkpoints.map((name) => ({ name, status: 'pending' })),
          })
        )
      );
    }

    const systems = await UtilitySystem.find({ projectId, organizationId }).sort({ order: 1, createdAt: 1 });
    return successResponse(systems);
  } catch (error) {
    console.error('Get utilities error:', error);
    return serverErrorResponse();
  }
}

// POST: add a system  { label, checkpoints?: string[] }  — or { action: 'detect' } to add systems found in scope
async function createUtilityHandler(req: NextRequest, context: Ctx, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const count = await UtilitySystem.countDocuments({ projectId, organizationId });

    if (body.action === 'detect') {
      const detected = detectSystems(await collectScope(projectId, organizationId));
      const existing = await UtilitySystem.find({ projectId, organizationId, isDeleted: { $in: [true, false] } }).select('system');
      const have = new Set(existing.map((s) => s.system));
      const fresh = detected.filter((t) => !have.has(t.key));
      await Promise.all(
        fresh.map((t, i) =>
          UtilitySystem.create({
            projectId, organizationId, system: t.key, label: t.label, source: 'auto', order: count + i,
            plannedProgress: 100, actualProgress: 0,
            checkpoints: t.checkpoints.map((name) => ({ name, status: 'pending' })),
          })
        )
      );
      return successResponse({ added: fresh.map((t) => t.label) }, fresh.length ? `Added ${fresh.length} system(s) from project scope` : 'No new systems found in project scope');
    }

    const label = String(body.label || '').trim();
    if (!label) return errorResponse('System name is required', 400);
    const tpl = templateForLabel(label);
    const custom: string[] = Array.isArray(body.checkpoints) ? body.checkpoints.map((c: unknown) => String(c).trim()).filter(Boolean) : [];
    const checkpointNames = custom.length ? custom : tpl?.checkpoints || [];
    const key = slugify(label);

    // Re-adding a removed system revives it instead of colliding with the unique key.
    const prior = await UtilitySystem.findOne({ projectId, organizationId, system: key, isDeleted: { $in: [true, false] } });
    if (prior && !prior.isDeleted) return errorResponse(`"${label}" is already on this project`, 409);

    const doc = prior || new UtilitySystem({ projectId, organizationId, system: key });
    doc.set({
      label,
      source: 'manual',
      notApplicable: false,
      isDeleted: false,
      deletedAt: undefined,
      order: count,
      plannedProgress: 100,
      actualProgress: 0,
      checkpoints: [...new Set(checkpointNames)].map((name) => ({ name, status: 'pending' })),
    });
    await doc.save();
    return createdResponse(doc, 'Utility system added');
  } catch (error) {
    console.error('Create utility error:', error);
    return serverErrorResponse();
  }
}

// PUT: update a system / its checkpoints
//   (no action)          { systemId, checkpointName, status, readings }  — record a test result
//   rename               { systemId, label }
//   setNotApplicable     { systemId, notApplicable }
//   addCheckpoint        { systemId, name }
//   renameCheckpoint     { systemId, checkpointName, name }
//   removeCheckpoint     { systemId, checkpointName }
async function updateUtilityHandler(req: NextRequest, context: Ctx, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();
    const { systemId, action, checkpointName, status, readings } = body;
    if (!systemId) return errorResponse('systemId is required', 400);

    const system = await UtilitySystem.findOne({ _id: systemId, projectId, organizationId });
    if (!system) return notFoundResponse('Utility system not found');

    const findCp = (n: string) => system.checkpoints.find((cp) => cp.name === n);
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    switch (action) {
      case 'rename':
        if (!String(body.label || '').trim()) return errorResponse('System name is required', 400);
        system.label = String(body.label).trim();
        break;
      case 'setNotApplicable':
        system.notApplicable = Boolean(body.notApplicable);
        break;
      case 'addCheckpoint':
        if (!name) return errorResponse('Checkpoint name is required', 400);
        if (findCp(name)) return errorResponse('That checkpoint already exists', 409);
        system.checkpoints.push({ name, status: 'pending' });
        break;
      case 'renameCheckpoint': {
        const cp = findCp(checkpointName);
        if (!cp) return notFoundResponse('Checkpoint not found');
        if (!name) return errorResponse('Checkpoint name is required', 400);
        if (name !== cp.name && findCp(name)) return errorResponse('That checkpoint already exists', 409);
        cp.name = name;
        break;
      }
      case 'removeCheckpoint':
        system.checkpoints = system.checkpoints.filter((cp) => cp.name !== checkpointName) as any;
        break;
      default: {
        const cp = checkpointName ? findCp(checkpointName) : undefined;
        if (checkpointName && !cp) return notFoundResponse('Checkpoint not found');
        if (cp && status) {
          if (!['pending', 'passed', 'failed'].includes(status)) return errorResponse('Invalid status', 400);
          cp.status = status;
          if (readings !== undefined) cp.readings = readings;
          cp.checkedAt = new Date();
        }
      }
    }

    system.actualProgress = pct(system);
    await system.save();
    return successResponse(system, 'Utility system updated');
  } catch (error) {
    console.error('Update utility error:', error);
    return serverErrorResponse();
  }
}

// DELETE: remove a system  ?systemId=...
async function deleteUtilityHandler(req: NextRequest, context: Ctx, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const systemId = new URL(req.url).searchParams.get('systemId');
    if (!systemId) return errorResponse('systemId is required', 400);
    const system = await UtilitySystem.findOne({ _id: systemId, projectId, organizationId });
    if (!system) return notFoundResponse('Utility system not found');
    system.isDeleted = true;
    system.deletedAt = new Date();
    await system.save();
    return successResponse({ _id: systemId }, 'Utility system removed');
  } catch (error) {
    console.error('Delete utility error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('utilities', 'read', getUtilitiesHandler);
export const POST = withProjectPermission('utilities', 'update', createUtilityHandler);
export const PUT = withProjectPermission('utilities', 'update', updateUtilityHandler);
export const DELETE = withProjectPermission('utilities', 'update', deleteUtilityHandler);
