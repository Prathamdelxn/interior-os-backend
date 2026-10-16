// =============================================================================
// InteriorOS Backend — Demo Portfolio Seeding API
// =============================================================================

import { NextRequest } from 'next/server';
import { withAuth, getOrganizationId, withOrgAdmin } from '@/middlewares/auth.middleware';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/project.model';
import { ProjectMember } from '@/models/project-member.model';
import { Building, Floor, Zone, Area, Package } from '@/models/wbs.model';
import { Task } from '@/models/task.model';
import { Milestone, MilestoneDelay } from '@/models/milestone.model';
import { Snag } from '@/models/snag.model';
import { RFI } from '@/models/rfi.model';
import { Risk } from '@/models/risk.model';
import { PurchaseOrder } from '@/models/purchase-order.model';
import { Inventory } from '@/models/inventory.model';
import { DailyProgressReport } from '@/models/dpr.model';
import { WeeklyReport } from '@/models/weekly-report.model';
import { Drawing } from '@/models/drawing.model';
import { MeetingMinutes } from '@/models/mom.model';
import { UtilitySystem } from '@/models/utility.model';
import { SitePhoto } from '@/models/site-photo.model';
import { Handover } from '@/models/handover.model';
import { successResponse, serverErrorResponse } from '@/lib/api-response';
import type { JwtPayload } from '@/lib/jwt';
import mongoose from 'mongoose';

async function seedDashboardDataHandler(req: NextRequest, _context: any, auth: JwtPayload) {
  try {
    await connectDB();
    const organizationId = getOrganizationId(auth);

    // ── Clean Up Existing Org Data ───────────────────────────────────────────
    await Promise.all([
      Project.deleteMany({ organizationId }),
      ProjectMember.deleteMany({ organizationId }),
      Building.deleteMany({ organizationId }),
      Floor.deleteMany({ organizationId }),
      Zone.deleteMany({ organizationId }),
      Area.deleteMany({ organizationId }),
      Package.deleteMany({ organizationId }),
      Task.deleteMany({ organizationId }),
      Milestone.deleteMany({ organizationId }),
      MilestoneDelay.deleteMany({ organizationId }),
      Snag.deleteMany({ organizationId }),
      RFI.deleteMany({ organizationId }),
      Risk.deleteMany({ organizationId }),
      PurchaseOrder.deleteMany({ organizationId }),
      DailyProgressReport.deleteMany({ organizationId }),
      WeeklyReport.deleteMany({ organizationId }),
      Drawing.deleteMany({ organizationId }),
      MeetingMinutes.deleteMany({ organizationId }),
      UtilitySystem.deleteMany({ organizationId }),
      SitePhoto.deleteMany({ organizationId }),
      Handover.deleteMany({ organizationId }),
      Inventory.deleteMany({ organizationId }),
    ]);

    // ── Create Project 1: DLF Cyber City Tower B ─────────────────────────────
    const p1 = new Project({
      organizationId,
      name: 'DLF Cyber City Tower B',
      code: 'PRJ-001',
      client: 'DLF Limited',
      type: 'Commercial Office',
      status: 'active',
      startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),  // 60 days from now
      budget: { amount: 125000000, currency: 'INR' },
      location: { city: 'Gurugram', state: 'Haryana', country: 'India', address: 'DLF Cyber City, Sector 25A' },
      description: 'Corporate headquarters fit-out for standard commercial offices, including high-end executive lounges, open workspaces, cafeteria, and server rooms.',
    });
    await p1.save();

    // Assign user as project manager
    const pm1 = new ProjectMember({
      organizationId,
      projectId: p1._id,
      userId: auth.userId,
      projectRole: 'project_manager',
    });
    await pm1.save();

    // WBS for Project 1
    const b1 = new Building({ organizationId, projectId: p1._id, name: 'Tower B (HQ Wing)' });
    await b1.save();

    const f1 = new Floor({ organizationId, projectId: p1._id, buildingId: b1._id, name: '4th Floor' });
    await f1.save();

    const z1 = new Zone({ organizationId, projectId: p1._id, floorId: f1._id, name: 'Zone Alpha' });
    await z1.save();

    const a1 = new Area({ organizationId, projectId: p1._id, zoneId: z1._id, name: 'Executive Lounge' });
    await a1.save();

    const pkg1 = new Package({ organizationId, projectId: p1._id, areaId: a1._id, name: 'Drywall & Ceiling', trade: 'civil' });
    await pkg1.save();

    const pkg2 = new Package({ organizationId, projectId: p1._id, areaId: a1._id, name: 'HVAC Piping', trade: 'hvac' });
    await pkg2.save();

    // Tasks for Project 1
    const t1 = new Task({
      organizationId,
      projectId: p1._id,
      packageId: pkg1._id,
      name: 'Drywall framing installation',
      description: 'Metal stud framing installation matching the approved GFC layout plans.',
      status: 'completed',
      priority: 'high',
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      progress: 100,
    });
    await t1.save();

    const t2 = new Task({
      organizationId,
      projectId: p1._id,
      packageId: pkg1._id,
      name: 'Ceiling grid mounting',
      description: 'Main tee and cross tee grid framing installation for mineral fiber tiles.',
      status: 'in_progress',
      priority: 'medium',
      startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      progress: 60,
    });
    await t2.save();

    const t3 = new Task({
      organizationId,
      projectId: p1._id,
      packageId: pkg1._id,
      name: 'Acoustic tile placement',
      description: 'Placing mineral acoustic tiles into the completed ceiling grid.',
      status: 'todo',
      priority: 'low',
      startDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      progress: 0,
    });
    await t3.save();

    const t4 = new Task({
      organizationId,
      projectId: p1._id,
      packageId: pkg2._id,
      name: 'HVAC piping insulation',
      description: 'Insulating chilled water copper pipes with nitrile rubber sheets.',
      status: 'completed',
      priority: 'high',
      startDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      progress: 100,
    });
    await t4.save();

    // Milestones for Project 1
    const m1 = new Milestone({
      organizationId,
      projectId: p1._id,
      name: 'Civil structure handover',
      dueDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      status: 'achieved',
      linkedTasks: [t1._id],
    });
    await m1.save();

    const m2 = new Milestone({
      organizationId,
      projectId: p1._id,
      name: 'Ceiling work completion',
      dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      status: 'delayed',
      linkedTasks: [t2._id, t3._id],
    });
    await m2.save();

    // Delay logged for Milestone 2
    const delay1 = new MilestoneDelay({
      milestoneId: m2._id,
      reason: 'Late vendor delivery of acoustic panels due to transit delays.',
      impactDays: 7,
      originalDate: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      newDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      approvedBy: auth.userId,
      status: 'approved',
    });
    await delay1.save();

    // Snags for Project 1
    const snag1 = new Snag({
      organizationId,
      projectId: p1._id,
      location: 'Executive Lounge, Ceiling Grid',
      description: 'Acoustic tile alignment issue and gaps visible near the eastern wall corner.',
      status: 'open',
      priority: 'high',
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    await snag1.save();

    const snag2 = new Snag({
      organizationId,
      projectId: p1._id,
      location: 'Executive Lounge Entrance',
      description: 'Deep scratch mark on premium wall paint finish near the main glass door.',
      status: 'assigned',
      priority: 'low',
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      assignee: auth.userId,
    });
    await snag2.save();

    // RFIs for Project 1
    const rfi1 = new RFI({
      organizationId,
      projectId: p1._id,
      rfiNumber: 'RFI-001',
      subject: 'Acoustic tile specifications clarification',
      question: 'Requesting confirmation on whether to use 15mm or 19mm thickness mineral fiber panels in the VIP rooms.',
      raisedBy: auth.userId,
      assignedTo: auth.userId,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      status: 'open',
      priority: 'medium',
    });
    await rfi1.save();

    // Risks for Project 1
    const risk1 = new Risk({
      organizationId,
      projectId: p1._id,
      category: 'procurement',
      description: 'Delay in HVAC indoor Unit dispatch might postpone ceiling closure timeline.',
      probability: 'high',
      impact: 'high',
      score: 9,
      mitigationPlan: 'Examine locally available alternative OEM indoor units for immediate substitution if approved by architect.',
      status: 'open',
      owner: auth.userId,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await risk1.save();

    // POs for Project 1
    const po1 = new PurchaseOrder({
      organizationId,
      projectId: p1._id,
      poNumber: 'PO-2026-001',
      vendorName: 'Armstrong World Industries',
      materialName: 'Acoustic Ceiling Mineral Fiber Tiles',
      items: [
        { name: 'Acoustic Ceiling Mineral Fiber Tiles', quantity: 500, unit: 'sqft', unitPrice: 800, amount: 400000 },
        { name: 'Ceiling Grid Metal Framing Channel', quantity: 50, unit: 'nos', unitPrice: 1000, amount: 50000 }
      ],
      amount: 450000,
      status: 'ordered',
      deliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });
    await po1.save();

    const po2 = new PurchaseOrder({
      organizationId,
      projectId: p1._id,
      poNumber: 'PO-2026-002',
      vendorName: 'Supreme Pipes Ltd',
      materialName: 'HVAC Copper Pipes 22mm',
      items: [
        { name: 'HVAC Copper Pipes 22mm', quantity: 200, unit: 'rm', unitPrice: 1200, amount: 240000 },
        { name: 'Nitrile Rubber Insulation Sleeve 22mm', quantity: 100, unit: 'nos', unitPrice: 400, amount: 40000 }
      ],
      amount: 280000,
      status: 'delivered',
      deliveryDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
    });
    await po2.save();

    // Inventory matching the delivered POs for Project 1
    const inv1 = new Inventory({
      organizationId,
      projectId: p1._id,
      productName: 'HVAC Copper Pipes 22mm',
      totalReceived: 200,
      installedQuantity: 80,
      unit: 'rm',
      installHistory: [
        { quantity: 50, date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), notes: 'Installed primary copper lines on Floor 4' },
        { quantity: 30, date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), notes: 'Completed riser connections' }
      ]
    });
    await inv1.save();

    const inv2 = new Inventory({
      organizationId,
      projectId: p1._id,
      productName: 'Nitrile Rubber Insulation Sleeve 22mm',
      totalReceived: 100,
      installedQuantity: 40,
      unit: 'nos',
      installHistory: [
        { quantity: 40, date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), notes: 'Insulated main lounge piping lines' }
      ]
    });
    await inv2.save();


    // ── Create Project 2: WeWork Embassy Golf Links ──────────────────────────
    const p2 = new Project({
      organizationId,
      name: 'WeWork Embassy Golf Links',
      code: 'PRJ-002',
      client: 'WeWork India',
      type: 'Tech Office',
      status: 'active',
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      budget: { amount: 82000000, currency: 'INR' },
      location: { city: 'Bangalore', state: 'Karnataka', country: 'India', address: 'Embassy Golf Links Business Park' },
      description: 'Design-Build high-density co-working fit-out, featuring premium cabins, collaborative spaces, and advanced MEP engineering layouts.',
    });
    await p2.save();

    const pm2 = new ProjectMember({
      organizationId,
      projectId: p2._id,
      userId: auth.userId,
      projectRole: 'project_manager',
    });
    await pm2.save();

    // WBS for Project 2
    const b2 = new Building({ organizationId, projectId: p2._id, name: 'Embassy Wing C' });
    await b2.save();

    const f2 = new Floor({ organizationId, projectId: p2._id, buildingId: b2._id, name: 'Ground Floor' });
    await f2.save();

    const z2 = new Zone({ organizationId, projectId: p2._id, floorId: f2._id, name: 'Cafeteria Area' });
    await z2.save();

    const a2 = new Area({ organizationId, projectId: p2._id, zoneId: z2._id, name: 'Main Kitchen' });
    await a2.save();

    const pkg3 = new Package({ organizationId, projectId: p2._id, areaId: a2._id, name: 'Kitchen Counter & Tiling', trade: 'interior' });
    await pkg3.save();

    // Tasks for Project 2
    const t5 = new Task({
      organizationId,
      projectId: p2._id,
      packageId: pkg3._id,
      name: 'Kitchen counter slab casting',
      description: 'Casting the concrete slab base for the kitchen counters.',
      status: 'completed',
      priority: 'medium',
      startDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      progress: 100,
    });
    await t5.save();

    const t6 = new Task({
      organizationId,
      projectId: p2._id,
      packageId: pkg3._id,
      name: 'Ceramic backwall tiling',
      description: 'Laying premium subway tiles on the kitchen back wall.',
      status: 'in_review',
      priority: 'high',
      startDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      progress: 90,
    });
    await t6.save();

    // Milestones for Project 2
    const m3 = new Milestone({
      organizationId,
      projectId: p2._id,
      name: 'Kitchen structure finish',
      dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      status: 'planned',
      linkedTasks: [t6._id],
    });
    await m3.save();

    // Snags for Project 2
    const snag3 = new Snag({
      organizationId,
      projectId: p2._id,
      location: 'Ground Floor, Kitchen Backwall',
      description: 'Grouting gaps and uneven tiles on the counter top backwall spacer lines.',
      status: 'resolved',
      priority: 'medium',
      dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });
    await snag3.save();

    // RFIs for Project 2
    const rfi2 = new RFI({
      organizationId,
      projectId: p2._id,
      rfiNumber: 'RFI-002',
      subject: 'Kitchen drainage pipe layout change',
      question: 'Drainage pipe intercepts core column structural rebar. Requesting permission to reroute around baseboard channel.',
      raisedBy: auth.userId,
      assignedTo: auth.userId,
      dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      status: 'responded',
      priority: 'high',
    });
    await rfi2.save();

    // POs for Project 2
    const po3 = new PurchaseOrder({
      organizationId,
      projectId: p2._id,
      poNumber: 'PO-2026-003',
      vendorName: 'Kalinga Stone India',
      materialName: 'Kitchen Granite Countertop Slab',
      items: [
        { name: 'Kitchen Granite Countertop Slab', quantity: 2, unit: 'nos', unitPrice: 90000, amount: 180000 }
      ],
      amount: 180000,
      status: 'approved',
      deliveryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    await po3.save();


    // ── Create Project 3: Google RMZ Ecoworld ───────────────────────────────
    const p3 = new Project({
      organizationId,
      name: 'Google RMZ Ecoworld',
      code: 'PRJ-003',
      client: 'Google India',
      type: 'Tech Office',
      status: 'active',
      startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // Completed recently
      budget: { amount: 220000000, currency: 'INR' },
      location: { city: 'Bangalore', state: 'Karnataka', country: 'India', address: 'RMZ Ecoworld, Bellandur Outer Ring Rd' },
      description: 'High-end technology park office workspace for executive leadership cabins and double-glazed acoustics meeting hubs.',
    });
    await p3.save();

    const pm3 = new ProjectMember({
      organizationId,
      projectId: p3._id,
      userId: auth.userId,
      projectRole: 'project_manager',
    });
    await pm3.save();

    // WBS for Project 3
    const b3 = new Building({ organizationId, projectId: p3._id, name: 'RMZ Tower 3' });
    await b3.save();

    const f3 = new Floor({ organizationId, projectId: p3._id, buildingId: b3._id, name: '12th Floor' });
    await f3.save();

    const z3 = new Zone({ organizationId, projectId: p3._id, floorId: f3._id, name: 'Executive Cabins' });
    await z3.save();

    const a3 = new Area({ organizationId, projectId: p3._id, zoneId: z3._id, name: 'MD Cabin' });
    await a3.save();

    const pkg4 = new Package({ organizationId, projectId: p3._id, areaId: a3._id, name: 'Glass Partitions & Carpeting', trade: 'interior' });
    await pkg4.save();

    // Tasks for Project 3
    const t7 = new Task({
      organizationId,
      projectId: p3._id,
      packageId: pkg4._id,
      name: 'Acoustic glass partition glazing',
      description: 'Laying out profile and fixing double glazed structural soundproof panels.',
      status: 'completed',
      priority: 'high',
      startDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      progress: 100,
    });
    await t7.save();

    const t8 = new Task({
      organizationId,
      projectId: p3._id,
      packageId: pkg4._id,
      name: 'Premium nylon carpet laying',
      description: 'Gluing and pattern alignment matching for the luxury office carpet tiles.',
      status: 'completed',
      priority: 'medium',
      startDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      progress: 100,
    });
    await t8.save();

    // Milestones for Project 3
    const m4 = new Milestone({
      organizationId,
      projectId: p3._id,
      name: 'Glass enclosure handover',
      dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      status: 'achieved',
      linkedTasks: [t7._id, t8._id],
    });
    await m4.save();

    // POs for Project 3
    const po4 = new PurchaseOrder({
      organizationId,
      projectId: p3._id,
      poNumber: 'PO-2026-004',
      vendorName: 'Saint Gobain Glass',
      materialName: 'Acoustic Double Glazed Partition Panels',
      amount: 1200000,
      status: 'delivered',
      deliveryDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
    });
    await po4.save();

    // ── Seed Drawings ────────────────────────────────────────────────────────
    const dwg1 = new Drawing({
      organizationId,
      projectId: p1._id,
      drawingNumber: 'DWG-SHOP-001',
      title: 'Executive Lounge Partition Details',
      discipline: 'shop',
      status: 'approved',
      revisions: [
        {
          revision: 'Rev 0',
          url: 'https://example.com/dwg-shop-001-r0.pdf',
          uploadedBy: new mongoose.Types.ObjectId(auth.userId),
          changes: 'Initial release',
          createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        },
        {
          revision: 'Rev 1',
          url: 'https://example.com/dwg-shop-001-r1.pdf',
          uploadedBy: new mongoose.Types.ObjectId(auth.userId),
          changes: 'Refined glass profiles & framing anchors',
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        }
      ]
    });
    await dwg1.save();

    const dwg2 = new Drawing({
      organizationId,
      projectId: p1._id,
      drawingNumber: 'DWG-GFC-001',
      title: 'Main Layout & Key Plan',
      discipline: 'gfc',
      status: 'approved',
      revisions: [
        {
          revision: 'Rev 0',
          url: 'https://example.com/dwg-gfc-001.pdf',
          uploadedBy: new mongoose.Types.ObjectId(auth.userId),
          changes: 'Approved GFC release',
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        }
      ]
    });
    await dwg2.save();

    const dwg3 = new Drawing({
      organizationId,
      projectId: p1._id,
      drawingNumber: 'DWG-TENDER-001',
      title: 'MEP Tender Specifications',
      discipline: 'tender',
      status: 'submitted',
      revisions: [
        {
          revision: 'Rev 0',
          url: 'https://example.com/dwg-tender-001.pdf',
          uploadedBy: new mongoose.Types.ObjectId(auth.userId),
          changes: 'Tender release',
          createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        }
      ]
    });
    await dwg3.save();

    const dwg4 = new Drawing({
      organizationId,
      projectId: p2._id,
      drawingNumber: 'DWG-SHOP-002',
      title: 'Kitchen Tiling and Counter Details',
      discipline: 'shop',
      status: 'under_review',
      revisions: [
        {
          revision: 'Rev 0',
          url: 'https://example.com/dwg-shop-002.pdf',
          uploadedBy: new mongoose.Types.ObjectId(auth.userId),
          changes: 'Initial tiling plan layout',
          createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        }
      ]
    });
    await dwg4.save();

    // ── Seed Daily Progress Reports (DPRs) ───────────────────────────────────
    const dpr1 = new DailyProgressReport({
      organizationId,
      projectId: p1._id,
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      weather: 'Sunny',
      manpower: [
        { trade: 'Masons', count: 4, contractor: 'Star Civil Builders' },
        { trade: 'Electricians', count: 2, contractor: 'Spark MEP Services' },
        { trade: 'Supervisors', count: 1, contractor: 'InteriorOS PM' }
      ],
      activities: [
        { category: 'Civil', description: 'Drywall studs alignment and floor track anchoring', plannedProgress: 10, actualProgress: 10, remarks: 'Completed on schedule' },
        { category: 'HVAC', description: 'Chilled water pipe insulation and bracket welding', plannedProgress: 15, actualProgress: 12, remarks: 'Minor welder outage delayed last section' }
      ],
      photos: [],
      submittedBy: new mongoose.Types.ObjectId(auth.userId)
    });
    await dpr1.save();

    const dpr2 = new DailyProgressReport({
      organizationId,
      projectId: p1._id,
      date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      weather: 'Sunny',
      manpower: [
        { trade: 'Masons', count: 6, contractor: 'Star Civil Builders' },
        { trade: 'Painters', count: 2, contractor: 'Deco Finishes' },
        { trade: 'Electricians', count: 2, contractor: 'Spark MEP Services' }
      ],
      activities: [
        { category: 'Civil', description: 'Ceiling grid mounting and main tee installation', plannedProgress: 20, actualProgress: 20 },
        { category: 'MEP', description: 'Copper pipe brazing and nitrogen pressure testing', plannedProgress: 10, actualProgress: 10, remarks: 'Pressure holding at 350 PSI' }
      ],
      photos: [],
      submittedBy: new mongoose.Types.ObjectId(auth.userId)
    });
    await dpr2.save();

    // ── Seed Weekly Reports ──────────────────────────────────────────────────
    const wr1 = new WeeklyReport({
      organizationId,
      projectId: p1._id,
      weekStart: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      weekEnd: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      completedActivities: ['Completed metal stud framing alignment', 'Completed chilled water copper pipe nitrogen testing'],
      delayedActivities: ['Acoustic tiles delivery delayed by 3 days due to state border checkpoint strike'],
      risks: ['Chilled water pump delivery timeline remains critical'],
      nextWeekPlan: ['Mount ceiling tiles in Zone Alpha', 'Complete wire pulling in executive zone', 'Install glass door panels'],
      submittedBy: new mongoose.Types.ObjectId(auth.userId)
    });
    await wr1.save();

    // ── Seed Meeting Minutes (MOM) ───────────────────────────────────────────
    const mom1 = new MeetingMinutes({
      organizationId,
      projectId: p1._id,
      title: 'Pre-execution Coordination Meeting',
      date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      attendees: ['Sameer Gaikwad (PM)', 'Rohan Mehta (Design Lead)', 'Kiran Shah (MEP rep)'],
      agenda: 'MEP Grid collisions review, ceiling coordinate plans, acoustic glass specs verification',
      notes: 'Reviewed and confirmed that HVAC copper lines must route strictly below ceiling hangers. Acoustic double glass profile anchors approved with modification.',
      actionItems: [
        {
          description: 'Verify exact ceiling heights in Zone Alpha executive lobby',
          assignee: new mongoose.Types.ObjectId(auth.userId),
          dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          status: 'closed'
        },
        {
          description: 'Submit acoustic double glass structural framing mock sample',
          assignee: new mongoose.Types.ObjectId(auth.userId),
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          status: 'open'
        }
      ]
    });
    await mom1.save();

    // ── Seed Utility Systems ──────────────────────────────────────────────────
    const util1 = new UtilitySystem({
      organizationId,
      projectId: p1._id,
      system: 'electrical',
      plannedProgress: 90,
      actualProgress: 85,
      checkpoints: [
        { name: 'Metal Conduit installation', status: 'passed', readings: '100% installed, rigid joints checked' },
        { name: 'FR-LSH Wire pulling', status: 'passed', readings: 'Completed in Zone Alpha & Beta' },
        { name: 'DB panel dressing & labeling', status: 'pending', readings: 'Scheduled post drywall closing' }
      ]
    });
    await util1.save();

    const util2 = new UtilitySystem({
      organizationId,
      projectId: p1._id,
      system: 'hvac',
      plannedProgress: 80,
      actualProgress: 70,
      checkpoints: [
        { name: 'GI duct suspension & hangers', status: 'passed', readings: 'Anchor pull test successful' },
        { name: 'Copper refrigeration pipe insulation', status: 'passed', readings: 'Insulation thickness verified' },
        { name: 'Indoor Unit commissioning', status: 'pending', readings: 'Units mounted, await wiring hookup' }
      ]
    });
    await util2.save();

    // ── Seed Site Photos ─────────────────────────────────────────────────────
    const photo1 = new SitePhoto({
      organizationId,
      projectId: p1._id,
      caption: 'Drywall framing progress in Executive Lounge Area',
      category: 'progress',
      url: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80',
      uploadedBy: new mongoose.Types.ObjectId(auth.userId)
    });
    await photo1.save();

    const photo2 = new SitePhoto({
      organizationId,
      projectId: p1._id,
      caption: 'MEP copper piping brazing and nitrogen test setup',
      category: 'progress',
      url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
      uploadedBy: new mongoose.Types.ObjectId(auth.userId)
    });
    await photo2.save();

    // ── Seed Handovers ────────────────────────────────────────────────────────
    const hand1 = new Handover({
      organizationId,
      projectId: p1._id,
      completionPercentage: 20,
      checklist: [
        { task: 'As-built structural & MEP drawings submission', status: 'pending' },
        { task: 'Subcontractor site de-mobilization', status: 'pending' },
        { task: 'Snag checklist clearance and signoff', status: 'pending' },
        { task: 'Deep post-construction cleaning', status: 'pending' },
        { task: 'OEM warranties and maintenance manuals dossier handover', status: 'pending' }
      ],
      documents: [
        { name: 'Premium Acoustic Double-Glazed Warranty Certificate', url: 'https://example.com/acoustics-warranty.pdf', type: 'warranty', uploadedAt: new Date() }
      ]
    });
    await hand1.save();

    return successResponse(null, 'Demo portfolio data seeded successfully');
  } catch (error) {
    console.error('Demo data seed error:', error);
    return serverErrorResponse();
  }
}

export const POST = withOrgAdmin(seedDashboardDataHandler);
