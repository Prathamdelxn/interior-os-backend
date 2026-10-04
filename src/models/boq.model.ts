// =============================================================================
// InteriorOS Backend — BOQ (Bill of Quantities) Models
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

// ── BOQ Master ──────────────────────────────────────────────────────────────

export interface IBOQ extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  version: number;
  versionLabel: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'superseded';
  totalAmount: number;
  currency: string;
  notes?: string;

  // Approval workflow
  submittedBy?: mongoose.Types.ObjectId;
  submittedAt?: Date;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectedBy?: mongoose.Types.ObjectId;
  rejectedAt?: Date;
  rejectionReason?: string;

  // Import metadata
  importedFrom?: 'manual' | 'excel';
  importFileName?: string;

  // Revision chain
  parentVersion?: mongoose.Types.ObjectId;

  createdBy: mongoose.Types.ObjectId;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BOQSchema = new Schema<IBOQ>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    version: { type: Number, required: true, default: 1 },
    versionLabel: { type: String, required: true, default: 'v1.0' },
    status: {
      type: String,
      enum: ['draft', 'pending_approval', 'approved', 'rejected', 'superseded'],
      default: 'draft',
      index: true,
    },
    totalAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
    notes: { type: String, trim: true },

    // Approval workflow
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, trim: true },

    // Import metadata
    importedFrom: { type: String, enum: ['manual', 'excel'] },
    importFileName: { type: String, trim: true },

    // Revision chain
    parentVersion: { type: Schema.Types.ObjectId, ref: 'BOQ' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
BOQSchema.index({ organizationId: 1, projectId: 1, version: 1 }, { unique: true });
BOQSchema.index({ projectId: 1, status: 1 });

// Soft delete filters
BOQSchema.pre('find', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

BOQSchema.pre('findOne', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

export const BOQ: Model<IBOQ> = mongoose.models.BOQ || mongoose.model<IBOQ>('BOQ', BOQSchema);

// ── BOQ Line Item ───────────────────────────────────────────────────────────

export interface IBOQItem extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  boqId: mongoose.Types.ObjectId;
  serialNumber: number;
  itemCode?: string;
  category: string;
  sectionNumber?: string;
  sectionTitle?: string;
  sectionScope?: string;
  itemName: string;
  description?: string;
  brandMakes?: string;
  quantity: number;
  unit: string;
  rate?: number;
  amount: number;
  remarks?: string;

  // BOQ vs Actual tracking
  consumedQuantity: number;
  remainingQuantity: number;
  variancePercentage: number;

  // WBS linkage (optional)
  buildingId?: mongoose.Types.ObjectId;
  floorId?: mongoose.Types.ObjectId;
  areaId?: mongoose.Types.ObjectId;
  packageId?: mongoose.Types.ObjectId;

  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BOQItemSchema = new Schema<IBOQItem>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    boqId: { type: Schema.Types.ObjectId, ref: 'BOQ', required: true, index: true },
    serialNumber: { type: Number, required: true },
    itemCode: { type: String, trim: true },
    category: { type: String, required: true, trim: true },
    sectionNumber: { type: String, trim: true },
    sectionTitle: { type: String, trim: true },
    sectionScope: { type: String, trim: true },
    itemName: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    brandMakes: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, trim: true },
    rate: { type: Number, default: 0, min: 0 },
    amount: { type: Number, default: 0, min: 0 },
    remarks: { type: String, trim: true },

    // BOQ vs Actual
    consumedQuantity: { type: Number, default: 0, min: 0 },
    remainingQuantity: { type: Number, default: 0 },
    variancePercentage: { type: Number, default: 0 },

    // WBS linkage
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building' },
    floorId: { type: Schema.Types.ObjectId, ref: 'Floor' },
    areaId: { type: Schema.Types.ObjectId, ref: 'Area' },
    packageId: { type: Schema.Types.ObjectId, ref: 'Package' },

    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
BOQItemSchema.index({ boqId: 1, serialNumber: 1 });
BOQItemSchema.index({ boqId: 1, category: 1 });
BOQItemSchema.index({ projectId: 1, boqId: 1 });

// Soft delete filters
BOQItemSchema.pre('find', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

BOQItemSchema.pre('findOne', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

export const BOQItem: Model<IBOQItem> = mongoose.models.BOQItem || mongoose.model<IBOQItem>('BOQItem', BOQItemSchema);

export default BOQ;
