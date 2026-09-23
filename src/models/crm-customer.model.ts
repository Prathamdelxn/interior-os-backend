// =============================================================================
// InteriorOS Backend — CRM Customer Model (ported from sky-lite-api Customer)
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISiteMeasurements {
  carpetArea?: string;
  roomDimensions?: string; // Room length × width
  ceilingHeight?: string;
  floorToCeilingHeight?: string;
  doorDimensions?: string;
  windowDimensions?: string;
  wallThickness?: string;
  columnBeamDimensions?: string;
  electricalPoints?: string;
  plumbingPoints?: string;
  acLocations?: string;
  furnitureDimensions?: string;
  siteConstraints?: string;
  rooms?: string;
  notes?: string;
}

export interface IRequirement {
  roomName?: string;
  description?: string;
  theme?: string;

  // Type of Interior
  interiorType?: string; // Residential, Commercial, Office, Restaurant, Retail, etc.

  // Functional Requirements
  roomUsage?: string;
  furnitureRequirements?: string;
  storage?: string;
  electricalPoints?: string;
  lightingRequirements?: string;
  plumbingRequirements?: string;
  circulation?: string;

  // Aesthetic Requirements
  designStyle?: string;
  colours?: string;
  materials?: string;
  flooring?: string;
  ceiling?: string;
  wallFinishes?: string;
  furnitureStyle?: string;
}

export interface IDrawingVersion {
  versionNumber: number;
  name: string;
  url: string;
  fileType: string;
  category?: '2D' | '3D' | 'Other';
  uploadedBy?: mongoose.Types.ObjectId;
  uploadedAt: Date;
  approvalStatus: 'draft' | 'pending_internal_approval' | 'internally_approved' | 'internally_rejected';
  assignedReviewer?: mongoose.Types.ObjectId;
  assignedReviewerName?: string;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  internalNotes?: string;
  rejectionReason?: string;
  clientStatus?: 'pending_client_review' | 'client_approved' | 'client_changes_requested';
  clientFeedback?: string;
  clientRespondedAt?: Date;
}

export interface IDesignFile {
  _id?: mongoose.Types.ObjectId;
  name: string;
  title?: string;
  url: string;
  fileType: string;
  category?: '2D' | '3D' | 'Other';
  discipline?: string;
  roomTag?: string;
  currentVersion?: number;
  assignedReviewer?: mongoose.Types.ObjectId;
  assignedReviewerName?: string;
  internalNotes?: string;
  rejectionReason?: string;
  status?: 'draft' | 'pending_internal_approval' | 'internally_approved' | 'internally_rejected' | 'client_approved' | 'client_changes_requested';
  versions?: IDrawingVersion[];
  uploadedAt: Date;
}

export interface IQuotationItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
}

export interface IQuotation {
  version?: number;
  items: IQuotationItem[];
  subtotal?: number;
  tax?: number;
  taxPercentage?: number;
  discount?: number;
  grandTotal?: number;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Rejected';
  createdAt: Date;
  notes?: string;
}

export interface IBoqItem {
  serialNumber?: number;
  category: string;
  itemName: string;
  description?: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface IBoqVersion {
  version: number;
  items: IBoqItem[];
  totalAmount: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  createdAt?: Date;
  notes?: string;
}

export interface ICrmCustomer extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  leadNumber?: string;
  leadSource?:
    | 'Phone Call'
    | 'Walk-in'
    | 'Referral'
    | 'Existing Customer'
    | 'Builder Reference'
    | 'Architect Reference'
    | 'Society Reference'
    | 'Social Media'
    | 'Other';
  name: string;
  mobileNumber: string;
  alternateNumber?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  propertyType?: 'Flat' | 'Villa' | 'Office' | 'Shop' | 'Other';
  propertyAddress?: string;
  projectLocation?: string;

  assignedSalesExecutive?: mongoose.Types.ObjectId;
  designerAssigned?: mongoose.Types.ObjectId;

  priority: 'Low' | 'Medium' | 'High';
  budgetRange?: string;
  possessionDate?: Date;

  status:
    | 'New Lead'
    | 'Contacted'
    | 'Meeting Scheduled'
    | 'Under Site Visit'
    | 'Measurement Done'
    | 'Under Requirement'
    | 'Requirement Completed'
    | 'Under Drawing'
    | 'Design Approved'
    | 'Under BOQ Creation'
    | 'Under Quotation'
    | 'Quotation Pending'
    | 'Quotation Sent'
    | 'Negotiation'
    | 'Booking Pending'
    | 'Won'
    | 'Converted'
    | 'Lost';
  remarks?: string;

  lostReason?: 'Budget' | 'Competitor' | 'No Response' | 'Possession Delayed' | 'Cancelled' | 'Other';
  competitorName?: string;
  futureFollowUpDate?: Date;

  siteVisitScheduledDate?: Date;
  siteMeasurements?: ISiteMeasurements;
  sitePhotos: string[];

  requirements: IRequirement[];
  drawingHandoverNotes?: string;
  designFiles: IDesignFile[];
  boqs: IBoqVersion[];
  quotations: IQuotation[];

  shareSettings?: {
    shareToken?: string;
    isPublic: boolean;
    expiresAt?: Date | null;
    allowDownload: boolean;
    includeRequirements: boolean;
    viewCount: number;
    lastViewedAt?: Date;
  };

  createdBy: mongoose.Types.ObjectId;
  linkedProject?: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const SiteMeasurementsSchema = new Schema<ISiteMeasurements>(
  {
    carpetArea: String,
    roomDimensions: String,
    ceilingHeight: String,
    floorToCeilingHeight: String,
    doorDimensions: String,
    windowDimensions: String,
    wallThickness: String,
    columnBeamDimensions: String,
    electricalPoints: String,
    plumbingPoints: String,
    acLocations: String,
    furnitureDimensions: String,
    siteConstraints: String,
    rooms: String,
    notes: String,
  },
  { _id: false }
);

const RequirementSchema = new Schema<IRequirement>({
  roomName: String,
  description: String,
  theme: String,
  interiorType: String,
  roomUsage: String,
  furnitureRequirements: String,
  storage: String,
  electricalPoints: String,
  lightingRequirements: String,
  plumbingRequirements: String,
  circulation: String,
  designStyle: String,
  colours: String,
  materials: String,
  flooring: String,
  ceiling: String,
  wallFinishes: String,
  furnitureStyle: String,
});

const DrawingVersionSchema = new Schema<IDrawingVersion>(
  {
    versionNumber: { type: Number, required: true, default: 1 },
    name: { type: String, required: true },
    url: { type: String, required: true },
    fileType: { type: String, default: 'image' },
    category: { type: String, enum: ['2D', '3D', 'Other'], default: '2D' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
    approvalStatus: {
      type: String,
      enum: ['draft', 'pending_internal_approval', 'internally_approved', 'internally_rejected'],
      default: 'draft',
    },
    assignedReviewer: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedReviewerName: { type: String },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    internalNotes: { type: String },
    rejectionReason: { type: String },
    clientStatus: {
      type: String,
      enum: ['pending_client_review', 'client_approved', 'client_changes_requested'],
      default: 'pending_client_review',
    },
    clientFeedback: { type: String },
    clientRespondedAt: { type: Date },
  },
  { _id: true }
);

const DesignFileSchema = new Schema<IDesignFile>({
  name: { type: String, required: true },
  title: { type: String },
  url: { type: String, required: true },
  fileType: { type: String, default: 'image' },
  category: { type: String, enum: ['2D', '3D', 'Other'], default: '2D' },
  discipline: { type: String, default: 'Architectural' },
  roomTag: { type: String },
  currentVersion: { type: Number, default: 1 },
  assignedReviewer: { type: Schema.Types.ObjectId, ref: 'User' },
  assignedReviewerName: { type: String },
  internalNotes: { type: String },
  rejectionReason: { type: String },
  status: {
    type: String,
    enum: [
      'draft',
      'pending_internal_approval',
      'internally_approved',
      'internally_rejected',
      'client_approved',
      'client_changes_requested',
    ],
    default: 'draft',
  },
  versions: [DrawingVersionSchema],
  uploadedAt: { type: Date, default: Date.now },
});

const QuotationItemSchema = new Schema<IQuotationItem>(
  {
    description: String,
    quantity: Number,
    unitPrice: Number,
    total: Number,
  },
  { _id: false }
);

const QuotationSchema = new Schema<IQuotation>({
  version: Number,
  items: [QuotationItemSchema],
  subtotal: Number,
  tax: Number,
  taxPercentage: Number,
  discount: Number,
  grandTotal: Number,
  status: { type: String, enum: ['Draft', 'Sent', 'Accepted', 'Rejected'], default: 'Sent' },
  createdAt: { type: Date, default: Date.now },
  notes: String,
});

const BoqItemSchema = new Schema(
  {
    serialNumber: Number,
    category: String,
    itemName: String,
    description: String,
    quantity: Number,
    unit: String,
    rate: Number,
    amount: Number,
  },
  { _id: false }
);

const CustomerBoqSchema = new Schema(
  {
    version: Number,
    items: [BoqItemSchema],
    totalAmount: Number,
    status: { type: String, enum: ['draft', 'pending_approval', 'approved', 'rejected'], default: 'draft' },
    createdAt: { type: Date, default: Date.now },
    notes: String,
  },
  { _id: false }
);

const CrmCustomerSchema = new Schema<ICrmCustomer>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required'],
      index: true,
    },
    leadNumber: { type: String, index: true },
    leadSource: {
      type: String,
      enum: [
        'Phone Call',
        'Walk-in',
        'Referral',
        'Existing Customer',
        'Builder Reference',
        'Architect Reference',
        'Society Reference',
        'Social Media',
        'Other',
      ],
    },
    name: { type: String, required: [true, 'Please provide customer name'], trim: true },
    mobileNumber: { type: String, required: [true, 'Please provide mobile number'], trim: true },
    alternateNumber: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    propertyType: { type: String, enum: ['Flat', 'Villa', 'Office', 'Shop', 'Other'] },
    propertyAddress: { type: String, trim: true },
    projectLocation: { type: String, trim: true },

    assignedSalesExecutive: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    designerAssigned: { type: Schema.Types.ObjectId, ref: 'User' },

    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    budgetRange: { type: String },
    possessionDate: { type: Date },

    status: {
      type: String,
      enum: [
        'New Lead',
        'Contacted',
        'Meeting Scheduled',
        'Under Site Visit',
        'Measurement Done',
        'Under Requirement',
        'Requirement Completed',
        'Under Drawing',
        'Design Approved',
        'Under BOQ Creation',
        'Under Quotation',
        'Quotation Pending',
        'Quotation Sent',
        'Negotiation',
        'Booking Pending',
        'Won',
        'Converted',
        'Lost',
      ],
      default: 'New Lead',
      index: true,
    },
    remarks: { type: String },

    lostReason: { type: String, enum: ['Budget', 'Competitor', 'No Response', 'Possession Delayed', 'Cancelled', 'Other'] },
    competitorName: { type: String },
    futureFollowUpDate: { type: Date },

    siteVisitScheduledDate: { type: Date },
    siteMeasurements: SiteMeasurementsSchema,
    sitePhotos: [{ type: String }],

    requirements: [RequirementSchema],
    drawingHandoverNotes: { type: String },
    designFiles: [DesignFileSchema],
    boqs: [CustomerBoqSchema],
    quotations: [QuotationSchema],

    shareSettings: {
      shareToken: { type: String, unique: true, sparse: true, index: true },
      isPublic: { type: Boolean, default: false },
      expiresAt: { type: Date, default: null },
      allowDownload: { type: Boolean, default: true },
      includeRequirements: { type: Boolean, default: true },
      viewCount: { type: Number, default: 0 },
      lastViewedAt: { type: Date },
    },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    linkedProject: { type: Schema.Types.ObjectId, ref: 'Project' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

CrmCustomerSchema.index({ organizationId: 1, leadNumber: 1 }, { unique: true });
CrmCustomerSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
CrmCustomerSchema.index({ organizationId: 1, mobileNumber: 1 });
CrmCustomerSchema.index({ organizationId: 1, name: 1 });
CrmCustomerSchema.index({ organizationId: 1, createdAt: -1 });
delete mongoose.models.CrmCustomer;
export const CrmCustomer: Model<ICrmCustomer> =
  mongoose.models.CrmCustomer || mongoose.model<ICrmCustomer>('CrmCustomer', CrmCustomerSchema);

export default CrmCustomer;
