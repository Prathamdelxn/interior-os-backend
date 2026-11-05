// =============================================================================
// InteriorOS Backend — CRM Lead Model
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';
import './user.model';
import './project.model';

export interface IMeasurement {
  roomName: string;
  dimensions: string;
  notes?: string;
  photos: string[];
  videos: string[];
}

export interface ISiteVisit {
  scheduledAt?: Date;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled';
  photos: string[];
  videos: string[];
  measurements: IMeasurement[];
  notes?: string;
}

export interface IRequirements {
  style?: string;
  rooms: string[];
  materials: string[];
  timeline?: string;
  budget?: number;
  aiWbsGenerated: boolean;
  aiBoqGenerated: boolean;
}

export interface IBOQQuoteItem {
  item: string;
  category: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
}

export interface ICostSheet {
  materialCost: number;
  laborCost: number;
  margin: number; // in percentage
  tax: number; // in percentage
  total: number;
}

export interface IProposalTracker {
  title: string;
  description?: string;
  terms?: string;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected';
  sentAt?: Date;
  viewedAt?: Date;
  respondedAt?: Date;
}

export interface IQuotationVersion {
  version: number;
  boq: IBOQQuoteItem[];
  costSheet: ICostSheet;
  proposal: IProposalTracker;
  pdfUrl?: string;
  createdAt: Date;
}

export interface IDesignFile {
  name: string;
  url: string;
  fileType: string;
  category?: string;
  uploadedAt: Date;
}

export interface ICRMLead extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  leadName: string;
  phone: string;
  email: string;
  projectType: 'Commercial Office' | 'Residential' | 'Tech Office' | 'General';
  budget: number;
  location: string;
  propertyType: string;
  source: 'website' | 'meta_ads' | 'google_ads' | 'justdial' | 'indiamart' | 'referrals' | 'walk_in' | 'architects' | 'other';
  stage: 'lead' | 'qualified' | 'site_visit' | 'design_proposal' | 'quotation' | 'negotiation' | 'won' | 'lost';
  leadScore: number;
  urgency: 'low' | 'medium' | 'high';
  assignedDesigner?: mongoose.Types.ObjectId;
  assignedSalesPerson?: mongoose.Types.ObjectId;
  siteVisit: ISiteVisit;
  requirements: IRequirements;
  quotations: IQuotationVersion[];
  designFiles: IDesignFile[];
  createdProjectId?: mongoose.Types.ObjectId;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MeasurementSchema = new Schema<IMeasurement>({
  roomName: { type: String, required: true },
  dimensions: { type: String, required: true },
  notes: String,
  photos: [String],
  videos: [String],
});

const SiteVisitSchema = new Schema<ISiteVisit>({
  scheduledAt: Date,
  status: {
    type: String,
    enum: ['pending', 'scheduled', 'completed', 'cancelled'],
    default: 'pending',
  },
  photos: [String],
  videos: [String],
  measurements: [MeasurementSchema],
  notes: String,
});

const RequirementsSchema = new Schema<IRequirements>({
  style: String,
  rooms: [String],
  materials: [String],
  timeline: String,
  budget: Number,
  aiWbsGenerated: { type: Boolean, default: false },
  aiBoqGenerated: { type: Boolean, default: false },
});

const BOQQuoteItemSchema = new Schema<IBOQQuoteItem>({
  item: { type: String, required: true },
  category: { type: String, required: true },
  quantity: { type: Number, required: true, default: 1 },
  unit: { type: String, required: true, default: 'Rft' },
  rate: { type: Number, required: true, default: 0 },
  amount: { type: Number, required: true, default: 0 },
});

const CostSheetSchema = new Schema<ICostSheet>({
  materialCost: { type: Number, default: 0 },
  laborCost: { type: Number, default: 0 },
  margin: { type: Number, default: 15 },
  tax: { type: Number, default: 18 },
  total: { type: Number, default: 0 },
});

const ProposalTrackerSchema = new Schema<IProposalTracker>({
  title: { type: String, required: true },
  description: String,
  terms: String,
  status: {
    type: String,
    enum: ['draft', 'sent', 'viewed', 'accepted', 'rejected'],
    default: 'draft',
  },
  sentAt: Date,
  viewedAt: Date,
  respondedAt: Date,
});

const QuotationVersionSchema = new Schema<IQuotationVersion>({
  version: { type: Number, required: true },
  boq: [BOQQuoteItemSchema],
  costSheet: CostSheetSchema,
  proposal: ProposalTrackerSchema,
  pdfUrl: String,
  createdAt: { type: Date, default: Date.now },
});

const DesignFileSchema = new Schema<IDesignFile>({
  name: { type: String, required: true },
  url: { type: String, required: true },
  fileType: { type: String, required: true },
  category: String,
  uploadedAt: { type: Date, default: Date.now },
});

const CRMLeadSchema = new Schema<ICRMLead>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required'],
      index: true,
    },
    leadName: {
      type: String,
      required: [true, 'Lead name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
    },
    projectType: {
      type: String,
      enum: ['Commercial Office', 'Residential', 'Tech Office', 'General'],
      default: 'General',
    },
    budget: {
      type: Number,
      default: 0,
    },
    location: {
      type: String,
      trim: true,
    },
    propertyType: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      enum: ['website', 'meta_ads', 'google_ads', 'justdial', 'indiamart', 'referrals', 'walk_in', 'architects', 'other'],
      default: 'other',
    },
    stage: {
      type: String,
      enum: ['lead', 'qualified', 'site_visit', 'design_proposal', 'quotation', 'negotiation', 'won', 'lost'],
      default: 'lead',
      index: true,
    },
    leadScore: {
      type: Number,
      default: 0,
    },
    urgency: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    assignedDesigner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedSalesPerson: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    siteVisit: {
      type: SiteVisitSchema,
      default: () => ({ status: 'pending', photos: [], videos: [], measurements: [] }),
    },
    requirements: {
      type: RequirementsSchema,
      default: () => ({ rooms: [], materials: [], aiWbsGenerated: false, aiBoqGenerated: false }),
    },
    quotations: [QuotationVersionSchema],
    designFiles: [DesignFileSchema],
    createdProjectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Search indexes
CRMLeadSchema.index({ leadName: 'text', phone: 'text', email: 'text', location: 'text' });

// Soft delete middleware
CRMLeadSchema.pre('find', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

CRMLeadSchema.pre('findOne', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

export const CRMLead: Model<ICRMLead> =
  mongoose.models.CRMLead || mongoose.model<ICRMLead>('CRMLead', CRMLeadSchema);

export default CRMLead;
