// =============================================================================
// InteriorOS Backend — RFIs API Route
//
// Two ways to raise an RFI:
//   1. "I know who to ask"   → assignedTo = that person (routing 'direct'); they are e-mailed.
//   2. "I'm not sure who"    → no assignee (routing 'triage'); the project managers are e-mailed
//                              and anyone with RFI update rights can assign / reassign it.
// Every hand-off is kept in assignmentHistory.
// =============================================================================

import { NextRequest } from 'next/server';
import { getOrganizationId } from '@/middlewares/auth.middleware';
import { withProjectPermission } from '@/middlewares/project-auth.middleware';
import { connectDB } from '@/lib/db';
import { RFI } from '@/models/rfi.model';
import { User } from '@/models/user.model';
import { ProjectMember } from '@/models/project-member.model';
import { Project } from '@/models/project.model';
import { sendEmail } from '@/lib/email';
import { notifyUsers } from '@/lib/notify';
import { successResponse, createdResponse, serverErrorResponse, errorResponse, notFoundResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';

type Ctx = { params: Promise<Record<string, string>> };
const PERSON = 'firstName lastName email';

const POPULATE = [
  { path: 'raisedBy', select: PERSON },
  { path: 'assignedTo', select: PERSON },
  { path: 'respondedBy', select: PERSON },
  { path: 'assignmentHistory.by', select: PERSON },
  { path: 'assignmentHistory.from', select: PERSON },
  { path: 'assignmentHistory.to', select: PERSON },
];

const fullName = (u: any) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : 'Someone');
const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The assignee must be an active user of this organisation. */
async function validAssignee(userId: unknown, organizationId: string) {
  if (!userId) return null;
  return User.findOne({ _id: userId, organizationId, isDeleted: { $ne: true } }).select(PERSON).lean();
}

/** Project managers on this project (they route "not sure who" RFIs). */
async function projectManagers(projectId: string, organizationId: string) {
  const pms = await ProjectMember.find({ projectId, organizationId, isDeleted: false, projectRole: 'project_manager' })
    .select('userId')
    .lean();
  if (!pms.length) return [];
  return User.find({ _id: { $in: pms.map((m: any) => m.userId) }, isDeleted: { $ne: true } }).select(PERSON).lean();
}

/** E-mail + in-app (bell) notification. Fire-and-forget: never fails the RFI itself. */
function notify(opts: { to: any[]; heading: string; intro: string; rfi: any; projectName: string; link: string; sender?: string }) {
  const r0 = opts.rfi;
  notifyUsers({
    organizationId: String(r0.organizationId),
    userIds: opts.to.map((u) => u?._id),
    category: 'rfi',
    type: 'action_required',
    title: `${r0.rfiNumber}: ${opts.heading}`,
    body: `${opts.intro} "${r0.subject}" · ${opts.projectName}`,
    actionUrl: `/interior-new/projects/${r0.projectId}/rfis?rfi=${r0._id}`,
    actionLabel: 'Open RFI',
    sender: opts.sender,
    related: { type: 'rfi', id: String(r0._id) },
  });

  const emails = [...new Set(opts.to.map((u) => u?.email).filter(Boolean))];
  if (!emails.length) return;
  const r = opts.rfi;
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h2 style="color:#1e3a8a;margin:0 0 6px">${escapeHtml(opts.heading)}</h2>
      <p style="color:#475569;margin:0 0 16px">${escapeHtml(opts.intro)}</p>
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;background:#f8fafc">
        <div style="font-size:12px;color:#64748b">${escapeHtml(r.rfiNumber)} · ${escapeHtml(opts.projectName)} · ${escapeHtml(r.priority)} priority</div>
        <div style="font-size:16px;font-weight:700;margin:4px 0 8px">${escapeHtml(r.subject)}</div>
        <div style="font-size:14px;white-space:pre-wrap">${escapeHtml(r.question)}</div>
        <div style="font-size:12px;color:#64748b;margin-top:10px">Due ${escapeHtml(new Date(r.dueDate).toDateString())}</div>
      </div>
      <p style="margin:18px 0"><a href="${opts.link}" style="background:#1e3a8a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600">Open RFI</a></p>
    </div>`;
  sendEmail({ to: emails, subject: `${r.rfiNumber}: ${r.subject}`, html }).catch((e) =>
    console.error('RFI notification e-mail failed', e?.message || e)
  );
}

const rfiLink = (req: NextRequest, projectId: string, rfiId: string) => {
  const origin = req.headers.get('origin') || process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || '';
  return `${origin}/interior-new/projects/${projectId}/rfis?rfi=${rfiId}`;
};

// GET: all RFIs for the project, with people resolved
async function getRfisHandler(_req: NextRequest, context: Ctx, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const rfis = await RFI.find({ projectId, organizationId }).populate(POPULATE).sort({ createdAt: -1 });
    return successResponse(rfis);
  } catch (error) {
    console.error('Get RFIs error:', error);
    return serverErrorResponse();
  }
}

// POST: raise an RFI. assignedTo optional — without it the RFI goes to the project managers to route.
async function createRfiHandler(req: NextRequest, context: Ctx, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const subject = String(body.subject || '').trim();
    const question = String(body.question || '').trim();
    if (!subject || !question) return errorResponse('subject and question are required', 400);

    let assignee: any = null;
    if (body.assignedTo) {
      assignee = await validAssignee(body.assignedTo, organizationId);
      if (!assignee) return errorResponse('The selected person is not part of this organisation', 400);
    }

    const currentYear = new Date().getFullYear();
    const latestRfi = await RFI.findOne({ organizationId, isDeleted: { $in: [true, false] } })
      .sort({ createdAt: -1 })
      .select('rfiNumber')
      .lean();
    let nextNum = 1;
    if (latestRfi?.rfiNumber) {
      const match = latestRfi.rfiNumber.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    let rfiNumber = `RFI-${currentYear}-${String(nextNum).padStart(3, '0')}`;
    while (await RFI.exists({ organizationId, projectId, rfiNumber, isDeleted: { $in: [true, false] } })) {
      nextNum++;
      rfiNumber = `RFI-${currentYear}-${String(nextNum).padStart(3, '0')}`;
    }

    const newRfi = new RFI({
      rfiNumber,
      projectId,
      organizationId,
      subject,
      question,
      topic: body.topic ? String(body.topic).trim() : undefined,
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      raisedBy: auth.userId,
      assignedTo: assignee?._id || null,
      routing: assignee ? 'direct' : 'triage',
      assignmentHistory: [{ from: null, to: assignee?._id || null, by: auth.userId, note: assignee ? 'Raised' : 'Raised — needs routing', at: new Date() }],
      dueDate: body.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // default 7 days
      status: 'open',
      priority: body.priority || 'medium',
    });
    await newRfi.save();

    const [raiser, project] = await Promise.all([
      User.findById(auth.userId).select(PERSON).lean(),
      Project.findById(projectId).select('name').lean(),
    ]);
    const link = rfiLink(req, projectId, String(newRfi._id));
    const projectName = (project as any)?.name || 'Project';
    if (assignee) {
      if (String(assignee._id) !== String(auth.userId)) {
        notify({ to: [assignee], heading: 'You have a new RFI to answer', intro: `${fullName(raiser)} asked you a question.`, rfi: newRfi, projectName, link, sender: String(auth.userId) });
      }
    } else {
      const pms = (await projectManagers(projectId, organizationId)).filter((u: any) => String(u._id) !== String(auth.userId));
      notify({ to: pms, heading: 'An RFI needs an owner', intro: `${fullName(raiser)} raised a question and isn't sure who should answer it. Please assign it.`, rfi: newRfi, projectName, link, sender: String(auth.userId) });
    }

    await newRfi.populate(POPULATE);
    return createdResponse(newRfi, assignee ? `RFI sent to ${fullName(assignee)}` : 'RFI raised — the project manager will route it');
  } catch (error) {
    console.error('Create RFI error:', error);
    return serverErrorResponse();
  }
}

// PUT: respond / close / (re)assign
//   { rfiId, response }                         post an answer (status → responded)
//   { rfiId, status }                           e.g. close
//   { rfiId, action: 'assign', assignedTo, note } route or reassign to someone
async function updateRfiHandler(req: NextRequest, context: Ctx, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const body = await req.json();

    const { rfiId, status, response, action } = body;
    if (!rfiId) return errorResponse('rfiId is required', 400);

    const rfi = await RFI.findOne({ _id: rfiId, projectId, organizationId });
    if (!rfi) return notFoundResponse('RFI not found');

    if (action === 'assign') {
      const assignee = await validAssignee(body.assignedTo, organizationId);
      if (!assignee) return errorResponse('Choose a person from this organisation', 400);
      if (rfi.status === 'closed') return errorResponse('This RFI is closed', 400);
      if (String(rfi.assignedTo || '') === String(assignee._id)) return errorResponse('Already assigned to this person', 400);

      rfi.assignmentHistory.push({
        from: rfi.assignedTo || null,
        to: assignee._id as any,
        by: auth.userId as any,
        note: body.note ? String(body.note).trim() : undefined,
        at: new Date(),
      });
      rfi.assignedTo = assignee._id as any;
      if (rfi.status === 'responded') rfi.status = 'open'; // forwarded for a further answer
      await rfi.save();

      if (String(assignee._id) !== String(auth.userId)) {
        const [by, project] = await Promise.all([
          User.findById(auth.userId).select(PERSON).lean(),
          Project.findById(projectId).select('name').lean(),
        ]);
        notify({
          to: [assignee],
          heading: 'An RFI was assigned to you',
          intro: `${fullName(by)} assigned this question to you${body.note ? `: "${String(body.note).trim()}"` : '.'}`,
          rfi,
          projectName: (project as any)?.name || 'Project',
          link: rfiLink(req, projectId, String(rfi._id)),
          sender: String(auth.userId),
        });
      }
      await rfi.populate(POPULATE);
      return successResponse(rfi, `Assigned to ${fullName(assignee)}`);
    }

    if (status) {
      if (!['open', 'responded', 'closed'].includes(status)) return errorResponse('Invalid status', 400);
      rfi.status = status;
    }

    if (response) {
      rfi.response = response;
      rfi.respondedBy = auth.userId as any;
      rfi.respondedAt = new Date();
      rfi.status = 'responded';
    }

    await rfi.save();
    await rfi.populate(POPULATE);
    return successResponse(rfi, 'RFI updated successfully');
  } catch (error) {
    console.error('Update RFI error:', error);
    return serverErrorResponse();
  }
}

export const GET = withProjectPermission('rfis', 'read', getRfisHandler);
export const POST = withProjectPermission('rfis', 'create', createRfiHandler);
export const PUT = withProjectPermission('rfis', 'update', updateRfiHandler);

// DELETE: Delete an RFI
async function deleteRfiHandler(req: NextRequest, context: Ctx, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { projectId } = await context.params;
    const { searchParams } = new URL(req.url);
    const rfiId = searchParams.get('rfiId');

    if (!rfiId) {
      return errorResponse('rfiId is required', 400);
    }

    const rfi = await RFI.findOneAndDelete({ _id: rfiId, projectId, organizationId });
    if (!rfi) {
      return notFoundResponse('RFI not found');
    }

    return successResponse(null, 'RFI deleted successfully');
  } catch (error) {
    console.error('Delete RFI error:', error);
    return serverErrorResponse();
  }
}

export const DELETE = withProjectPermission('rfis', 'delete', deleteRfiHandler);
