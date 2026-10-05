// =============================================================================
// InteriorOS Backend — Purchase Order Model
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPurchaseOrder extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  poNumber: string;
  vendorName: string;
  materialName: string;
  amount: number;
  currency: string;
  status: 'requested' | 'pending' | 'approved' | 'ordered' | 'dispatched' | 'partially_delivered' | 'delivered' | 'rejected';
  deliveryDate?: Date;
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    amount: number;
  }>;
  grns?: Array<any>;
  grnData?: any;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    poNumber: { type: String, required: true },
    vendorName: { type: String, default: 'Unassigned', trim: true },
    materialName: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['requested', 'pending', 'approved', 'ordered', 'dispatched', 'partially_delivered', 'delivered', 'rejected'],
      default: 'pending',
      index: true,
    },
    deliveryDate: Date,
    items: [
      {
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        unit: { type: String, required: true },
        unitPrice: { type: Number, required: true, min: 0 },
        amount: { type: Number, required: true, min: 0 },
      },
    ],
    grns: { type: [Schema.Types.Mixed], default: [] },
    grnData: { type: Schema.Types.Mixed },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

PurchaseOrderSchema.index({ organizationId: 1, projectId: 1, poNumber: 1 }, { unique: true });

PurchaseOrderSchema.pre('find', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

PurchaseOrderSchema.pre('findOne', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

if (mongoose.models.PurchaseOrder) {
  delete mongoose.models.PurchaseOrder;
}

export const PurchaseOrder: Model<IPurchaseOrder> = mongoose.models.PurchaseOrder || mongoose.model<IPurchaseOrder>('PurchaseOrder', PurchaseOrderSchema);
export default PurchaseOrder;
