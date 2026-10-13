// =============================================================================
// InteriorOS Backend — Models Index
// =============================================================================

export { Organization } from './organization.model';
export type { IOrganization } from './organization.model';

export { User } from './user.model';
export type { IUser } from './user.model';

export { Role, DEFAULT_ROLES } from './role.model';
export type { IRole, IPermission, PermissionAction, ModuleName } from './role.model';

export { RefreshToken } from './refresh-token.model';
export type { IRefreshToken } from './refresh-token.model';

export { AuditLog } from './audit-log.model';
export type { IAuditLog } from './audit-log.model';

export { Notification } from './notification.model';
export type { INotification } from './notification.model';

export { Project } from './project.model';
export type { IProject } from './project.model';

export { ProjectMember } from './project-member.model';
export type { IProjectMember } from './project-member.model';

export { Building, Floor, Zone, Area, Package } from './wbs.model';
export type { IBuilding, IFloor, IZone, IArea, IPackage } from './wbs.model';

export { Task, TaskComment, TaskAttachment } from './task.model';
export type { ITask, ITaskComment, ITaskAttachment } from './task.model';

export { Milestone, MilestoneDelay } from './milestone.model';
export type { IMilestone, IMilestoneDelay } from './milestone.model';

export { Snag } from './snag.model';
export type { ISnag } from './snag.model';

export { RFI } from './rfi.model';
export type { IRFI } from './rfi.model';

export { Risk } from './risk.model';
export type { IRisk } from './risk.model';

export { PurchaseOrder } from './purchase-order.model';
export type { IPurchaseOrder } from './purchase-order.model';

export { DailyProgressReport } from './dpr.model';
export type { IDPR, IDPRActivity, IDPRManpower } from './dpr.model';

export { WeeklyReport } from './weekly-report.model';
export type { IWeeklyReport } from './weekly-report.model';

export { Drawing } from './drawing.model';
export type { IDrawing, IDrawingRevision } from './drawing.model';

export { MeetingMinutes } from './mom.model';
export type { IMeetingMinutes, IMOMActionItem } from './mom.model';

export { UtilitySystem } from './utility.model';
export type { IUtilitySystem, IUtilityCheckpoint } from './utility.model';

export { SitePhoto } from './site-photo.model';
export type { ISitePhoto } from './site-photo.model';

export { Handover } from './handover.model';
export type { IHandover, IHandoverCheckitem, IHandoverDocument } from './handover.model';

export { Inventory } from './inventory.model';
export type { IInventory } from './inventory.model';

export { SubscriptionPlan } from './subscription-plan.model';
export type { ISubscriptionPlan } from './subscription-plan.model';

export { ProjectTemplate } from './project-template.model';
export type { IProjectTemplate } from './project-template.model';

export { BOQ, BOQItem } from './boq.model';
export type { IBOQ, IBOQItem } from './boq.model';

export { ChangeRequest } from './change-request.model';
export type { IChangeRequest } from './change-request.model';

export { VariationOrder } from './variation-order.model';
export type { IVariationOrder } from './variation-order.model';

export { CRMLead } from './crm-lead.model';
export type { ICRMLead, ISiteVisit, IMeasurement, IRequirements, IQuotationVersion, IBOQQuoteItem } from './crm-lead.model';

export { ProjectFile } from './project-file.model';
export type { IProjectFile } from './project-file.model';

export { ProjectTransaction } from './project-transaction.model';
export type { IProjectTransaction } from './project-transaction.model';

export { Message } from './message.model';
export type { IMessage } from './message.model';

export { Payment } from './payment.model';
export type { IPayment, PaymentType, PaymentMethod } from './payment.model';
