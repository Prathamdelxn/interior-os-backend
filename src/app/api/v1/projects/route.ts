// =============================================================================
// InteriorOS Backend — Projects API: List & Create
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/project.model';
import { CrmCustomer } from '@/models/crm-customer.model';
import { ProjectMember } from '@/models/project-member.model';
import { Building, Floor, Zone, Area, Package } from '@/models/wbs.model';
import { Task } from '@/models/task.model';
import { Milestone } from '@/models/milestone.model';
import { PurchaseOrder } from '@/models/purchase-order.model';
import { ProjectTemplate } from '@/models/project-template.model';
import { calculateProjectMetrics } from '@/services/project-metrics.service';
import { successResponse, createdResponse, serverErrorResponse, paginatedResponse, parsePaginationParams, buildPaginationMeta, errorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import { z } from 'zod';
import mongoose from 'mongoose';

const createProjectSchema = z.object({
  name: z.string().trim().min(3, 'Project name must be at least 3 characters').max(100, 'Project name cannot exceed 100 characters'),
  client: z.string().trim().min(2, 'Client name must be at least 2 characters').max(100, 'Client name cannot exceed 100 characters'),
  type: z.enum(['Commercial Office', 'Residential', 'Tech Office', 'Co-working Space', 'General']).default('General'),
  startDate: z.string().min(1, 'Start date is required').transform((val) => new Date(val)),
  endDate: z.string().min(1, 'Target completion date is required').transform((val) => new Date(val)),
  budget: z.object({
    amount: z.number().nonnegative('Budget must be a non-negative number').default(0),
    currency: z.string().default('INR'),
  }).optional(),
  location: z.object({
    address: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    zipCode: z.string().optional(),
  }).optional(),
  description: z.string().max(1000).optional(),
  templateId: z.string().optional(),
}).refine((data) => data.endDate >= data.startDate, {
  message: 'Target completion date cannot be earlier than start date',
  path: ['endDate'],
});

// GET: List all projects
async function getProjectsHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);

    const searchParams = req.nextUrl.searchParams;
    const { page, limit, sort, order } = parsePaginationParams(searchParams);

    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const type = searchParams.get('type') || '';

    const query: any = { organizationId, isDeleted: false };

    // If the user is a regular member, restrict to projects they belong to
    if (auth.systemRole !== 'super_admin' && auth.systemRole !== 'org_admin') {
      const userMemberships = await ProjectMember.find({
        userId: auth.userId,
        organizationId,
        isDeleted: false,
      }).select('projectId');
      const projectIds = userMemberships.map((m) => m.projectId);
      query._id = { $in: projectIds };
    }

    if (status) {
      query.status = status;
    }
    if (type) {
      query.type = type;
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { client: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const sortOrder = order === 'asc' ? 1 : -1;
    const sortQuery: any = { [sort]: sortOrder };

    const total = await Project.countDocuments(query);
    const projects = await Project.find(query)
      .sort(sortQuery)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const projectIds = projects.map((p) => p._id);

    // If any projects have 0 budget, look up linked customer quotation/boq
    const zeroBudgetProjectIds = projects
      .filter((p) => !p.budget?.amount || p.budget.amount === 0)
      .map((p) => p._id);

    const customerBudgetMap = new Map<string, number>();
    if (zeroBudgetProjectIds.length > 0) {
      const customers = await CrmCustomer.find({
        organizationId,
        linkedProject: { $in: zeroBudgetProjectIds },
      }).select('linkedProject quotations boqs budgetRange').lean();

      for (const c of customers) {
        if (c.linkedProject) {
          let bAmount = 0;
          if (c.quotations && c.quotations.length > 0) {
            const accepted: any = c.quotations.find((q: any) => q.status === 'Accepted' || q.status === 'Approved') || c.quotations[c.quotations.length - 1];
            bAmount = Number(accepted?.grandTotal || accepted?.totalAmount || accepted?.subtotal || accepted?.total || 0);
          }
          if (!bAmount && c.boqs && c.boqs.length > 0) {
            bAmount = Number(c.boqs[c.boqs.length - 1]?.totalAmount || 0);
          }
          if (!bAmount && c.budgetRange) {
            const cleaned = String(c.budgetRange).replace(/[^0-9.]/g, '');
            const parsed = parseFloat(cleaned);
            if (!isNaN(parsed) && parsed > 0) bAmount = parsed;
          }
          if (bAmount > 0) {
            customerBudgetMap.set(String(c.linkedProject), bAmount);
            // Self-healing patch
            Project.updateOne({ _id: c.linkedProject }, { $set: { 'budget.amount': bAmount } }).catch(() => {});
          }
        }
      }
    }

    const teamCounts = await ProjectMember.aggregate([
      { $match: { projectId: { $in: projectIds }, isDeleted: false } },
      { $group: { _id: '$projectId', count: { $sum: 1 } } },
    ]);
    const teamMap = new Map(teamCounts.map((t: { _id: any; count: number }) => [String(t._id), t.count]));

    const enrichedProjects = await Promise.all(
      projects.map(async (project) => {
        const metrics = await calculateProjectMetrics(project._id, organizationId, project);
        let budgetObj = project.budget || { amount: 0, currency: 'INR' };
        if ((!budgetObj.amount || budgetObj.amount === 0) && customerBudgetMap.has(String(project._id))) {
          budgetObj = {
            ...budgetObj,
            amount: customerBudgetMap.get(String(project._id)) || 0,
          };
        }

        return {
          ...project,
          budget: budgetObj,
          teamSize: teamMap.get(String(project._id)) || 0,
          openSnags: 0,
          openRFIs: 0,
          progress: metrics.progress,
          health: metrics.health,
          healthColor: metrics.healthColor,
          healthLabel: metrics.healthLabel,
        };
      })
    );

    const meta = buildPaginationMeta(total, page, limit);
    return paginatedResponse(enrichedProjects, meta);
  } catch (error) {
    console.error('List projects error:', error);
    return serverErrorResponse();
  }
}

// POST: Create a new project
async function createProjectHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const body = await req.json();

    const validation = createProjectSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse(validation.error.issues[0].message, 400);
    }

    const { templateId, ...projectData } = validation.data;

    const existingProjects = await Project.find({
      organizationId,
      code: { $regex: /^PRJ-\d+$/ },
      isDeleted: { $in: [true, false] },
    })
      .select('code')
      .lean();

    let maxPrjNum = 0;
    for (const p of existingProjects) {
      if (p.code) {
        const match = p.code.match(/^PRJ-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxPrjNum) {
            maxPrjNum = num;
          }
        }
      }
    }

    let nextNum = maxPrjNum + 1;
    let code = `PRJ-${String(nextNum).padStart(3, '0')}`;
    while (await Project.findOne({ organizationId, code, isDeleted: { $in: [true, false] } })) {
      nextNum++;
      code = `PRJ-${String(nextNum).padStart(3, '0')}`;
    }

    const project = new Project({
      ...projectData,
      organizationId,
      code,
    });

    await project.save();

    const member = new ProjectMember({
      organizationId,
      projectId: project._id,
      userId: auth.userId,
      projectRole: 'project_manager',
    });
    await member.save();

    // ── Generate WBS, Tasks, Milestones, and POs from template ──────────────
    if (templateId) {
      const template = await ProjectTemplate.findOne({ _id: templateId, isDeleted: false });
      if (template) {
        const generatedTaskMap = new Map<string, mongoose.Types.ObjectId>();

        // 1. Generate WBS Hierarchy & Tasks
        if (template.wbs && template.wbs.length > 0) {
          for (const bTemp of template.wbs) {
            const building = new Building({
              organizationId,
              projectId: project._id,
              name: bTemp.name,
            });
            await building.save();

            if (bTemp.floors && bTemp.floors.length > 0) {
              for (const fTemp of bTemp.floors) {
                const floor = new Floor({
                  organizationId,
                  projectId: project._id,
                  buildingId: building._id,
                  name: fTemp.name,
                });
                await floor.save();

                if (fTemp.zones && fTemp.zones.length > 0) {
                  for (const zTemp of fTemp.zones) {
                    const zone = new Zone({
                      organizationId,
                      projectId: project._id,
                      floorId: floor._id,
                      name: zTemp.name,
                    });
                    await zone.save();

                    if (zTemp.areas && zTemp.areas.length > 0) {
                      for (const aTemp of zTemp.areas) {
                        const area = new Area({
                          organizationId,
                          projectId: project._id,
                          zoneId: zone._id,
                          name: aTemp.name,
                        });
                        await area.save();

                        if (aTemp.packages && aTemp.packages.length > 0) {
                          for (const pTemp of aTemp.packages) {
                            const pkg = new Package({
                              organizationId,
                              projectId: project._id,
                              areaId: area._id,
                              name: pTemp.name,
                              trade: pTemp.trade,
                            });
                            await pkg.save();

                            // Instantiate pre-filled tasks under this package
                            if (pTemp.tasks && pTemp.tasks.length > 0) {
                              for (const tTemp of pTemp.tasks) {
                                const tStartDate = new Date(project.startDate);
                                const tEndDate = new Date(tStartDate.getTime() + (tTemp.durationDays || 3) * 24 * 60 * 60 * 1000);

                                const task = new Task({
                                  organizationId,
                                  projectId: project._id,
                                  packageId: pkg._id,
                                  name: tTemp.name,
                                  description: tTemp.description || '',
                                  status: 'todo',
                                  priority: tTemp.priority || 'medium',
                                  startDate: tStartDate,
                                  endDate: tEndDate,
                                  progress: 0,
                                  assignees: [],
                                  dependencies: [],
                                });
                                await task.save();

                                // Store in map for milestone linking
                                generatedTaskMap.set(tTemp.name, task._id);
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // 2. Generate Milestones & Link Tasks
        if (template.milestones && template.milestones.length > 0) {
          for (const mTemp of template.milestones) {
            const mDueDate = new Date(project.startDate.getTime() + (mTemp.offsetDays || 0) * 24 * 60 * 60 * 1000);

            const linkedTasks: mongoose.Types.ObjectId[] = [];
            if (mTemp.linkedTaskNames && mTemp.linkedTaskNames.length > 0) {
              for (const tName of mTemp.linkedTaskNames) {
                const taskId = generatedTaskMap.get(tName);
                if (taskId) {
                  linkedTasks.push(taskId);
                }
              }
            }

            const milestone = new Milestone({
              organizationId,
              projectId: project._id,
              name: mTemp.name,
              dueDate: mDueDate,
              status: 'planned',
              linkedTasks,
            });
            await milestone.save();
          }
        }

        // 3. Generate Procurement / POs
        if (template.procurement && template.procurement.length > 0) {
          for (const pTemp of template.procurement) {
            const poCount = await PurchaseOrder.countDocuments({ organizationId });
            const poNumber = `PO-2026-${String(poCount + 1).padStart(3, '0')}`;

            const poItems = pTemp.items.map((it: any) => ({
              name: it.name,
              quantity: it.quantity,
              unit: it.unit,
              unitPrice: it.unitPrice,
              amount: it.quantity * it.unitPrice,
            }));

            const po = new PurchaseOrder({
              organizationId,
              projectId: project._id,
              poNumber,
              vendorName: pTemp.vendorName,
              materialName: pTemp.materialName,
              amount: pTemp.amount,
              currency: 'INR',
              status: 'pending',
              items: poItems,
            });
            await po.save();
          }
        }
      }
    }

    try {
      const { logAuditEvent } = await import('@/services/audit.service');
      logAuditEvent({
        organizationId,
        userId: auth.userId,
        action: 'create',
        entity: 'Project',
        entityId: project._id,
        entityName: project.name,
        description: `Created new project "${project.name}" (Code: ${project.code})`,
        changes: {
          after: {
            name: project.name,
            client: project.client,
            status: project.status,
            budget: project.budget?.amount || 0,
          },
        },
        req,
      }).catch(() => {});
    } catch {}

    return createdResponse(project, 'Project created successfully');
  } catch (error: any) {
    console.error('Create project error:', error);
    return serverErrorResponse();
  }
}

export const GET = withAuth(getProjectsHandler);
export const POST = withAuth(createProjectHandler);
