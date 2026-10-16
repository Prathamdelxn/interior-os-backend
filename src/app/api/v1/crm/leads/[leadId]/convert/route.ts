// =============================================================================
// InteriorOS Backend — CRM Convert Lead to Live Project API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId, withPermission } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { CRMLead } from '@/models/crm-lead.model';
import { Project } from '@/models/project.model';
import { ProjectMember } from '@/models/project-member.model';
import { BOQ, BOQItem } from '@/models/boq.model';
import { Building, Floor, Zone, Area, Package } from '@/models/wbs.model';
import { Task } from '@/models/task.model';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';

async function convertLeadHandler(req: NextRequest, context: { params: Promise<Record<string, string>> }, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);
    const { leadId } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return errorResponse('Invalid Lead ID', 400);
    }

    const lead = await CRMLead.findOne({
      _id: leadId,
      organizationId,
      isDeleted: false,
    });

    if (!lead) {
      return errorResponse('Lead not found', 404);
    }

    if (lead.createdProjectId) {
      return errorResponse('This lead has already been converted to a live project.', 400);
    }

    // Identify which quotation version to use (either 'accepted' status, or the latest)
    let acceptedQuote = lead.quotations.find((q) => q.proposal?.status === 'accepted');
    if (!acceptedQuote && lead.quotations.length > 0) {
      // Fallback: take latest version
      acceptedQuote = lead.quotations[lead.quotations.length - 1];
    }

    if (!acceptedQuote) {
      return errorResponse('No quotation versions found. Please generate a quotation before converting the lead.', 400);
    }

    // 1. Create a Project
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

    const pName = `${lead.leadName} ${lead.propertyType || 'Interior Setup'}`;

    const project = new Project({
      organizationId,
      name: pName,
      code,
      client: lead.leadName,
      type: lead.projectType || 'Residential',
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      budget: {
        amount: acceptedQuote.costSheet.total,
        currency: 'INR',
      },
      location: {
        address: lead.location || '',
        city: (lead.location || '').split(',')[0].trim() || 'Pune',
        country: 'India',
      },
      description: `Automatically converted from Won CRM Sales Lead. Original Lead ID: ${lead._id}`,
    });

    await project.save();

    // 2. Add calling user as Project Manager member
    const member = new ProjectMember({
      organizationId,
      projectId: project._id,
      userId: auth.userId,
      projectRole: 'project_manager',
    });
    await member.save();

    // 3. Create WBS and Task structure based on lead's requirements rooms
    const rooms = lead.requirements?.rooms || ['Living Room'];
    
    // Create base Building & Floor
    const building = new Building({
      organizationId,
      projectId: project._id,
      name: 'Block A',
    });
    await building.save();

    const floor = new Floor({
      organizationId,
      projectId: project._id,
      buildingId: building._id,
      name: 'Ground Floor',
    });
    await floor.save();

    // Create zones for each room
    for (const room of rooms) {
      const zone = new Zone({
        organizationId,
        projectId: project._id,
        floorId: floor._id,
        name: room,
      });
      await zone.save();

      const area = new Area({
        organizationId,
        projectId: project._id,
        zoneId: zone._id,
        name: 'Main Area',
      });
      await area.save();

      // Create a package for carpentry/finishes in this room
      const pkg = new Package({
        organizationId,
        projectId: project._id,
        areaId: area._id,
        name: `${room} Fitting`,
        trade: 'Carpentry & Finishes',
      });
      await pkg.save();

      // Seed 3 standard execution tasks under this package
      const tasksToCreate = [
        { name: `${room} Site Masking & Surface Prep`, duration: 2, priority: 'medium' },
        { name: `${room} Custom Woodwork Fitting`, duration: 5, priority: 'high' },
        { name: `${room} Paint Priming & Finishing Coats`, duration: 3, priority: 'medium' },
      ];

      let taskStartDate = new Date();
      for (const tConfig of tasksToCreate) {
        const taskEndDate = new Date(taskStartDate.getTime() + tConfig.duration * 24 * 60 * 60 * 1000);
        
        const task = new Task({
          organizationId,
          projectId: project._id,
          packageId: pkg._id,
          name: tConfig.name,
          description: `Execution task for ${room} under trade Carpentry & Finishes`,
          status: 'todo',
          priority: tConfig.priority,
          startDate: taskStartDate,
          endDate: taskEndDate,
          progress: 0,
          assignees: [],
          dependencies: [],
        });
        await task.save();

        // Sequential schedule
        taskStartDate = new Date(taskEndDate.getTime() + 24 * 60 * 60 * 1000); // start next task day after
      }
    }

    // 4. Create Project BOQ Document
    const projectBoq = new BOQ({
      organizationId,
      projectId: project._id,
      version: 1,
      versionLabel: 'v1.0',
      status: 'approved',
      totalAmount: acceptedQuote.costSheet.total,
      currency: 'INR',
      notes: `Imported from sales quotation v${acceptedQuote.version}`,
      createdBy: auth.userId,
    });
    await projectBoq.save();

    // 5. Clone BOQ Line Items
    for (let i = 0; i < acceptedQuote.boq.length; i++) {
      const qItem = acceptedQuote.boq[i];
      const projectBoqItem = new BOQItem({
        organizationId,
        projectId: project._id,
        boqId: projectBoq._id,
        serialNumber: i + 1,
        category: qItem.category,
        itemName: qItem.item,
        description: qItem.item,
        quantity: qItem.quantity,
        unit: qItem.unit,
        rate: qItem.rate,
        amount: qItem.amount,
        consumedQuantity: 0,
        remainingQuantity: qItem.quantity,
        variancePercentage: 0,
      });
      await projectBoqItem.save();
    }

    // 6. Update Lead status
    lead.stage = 'won';
    lead.createdProjectId = project._id;
    if (lead.quotations.length > 0) {
      // Mark quote status as accepted in the history
      lead.quotations.forEach((q) => {
        if (q.version === acceptedQuote!.version) {
          q.proposal.status = 'accepted';
          q.proposal.respondedAt = new Date();
        }
      });
    }
    await lead.save();

    return successResponse({
      projectId: project._id,
      code: project.code,
      name: project.name,
    }, 'Lead successfully converted to live execution project');
  } catch (error: any) {
    console.error('Lead conversion error:', error);
    return serverErrorResponse();
  }
}

export const POST = withPermission('crm_quotations', 'approve', convertLeadHandler);
