// =============================================================================
// InteriorOS Backend — RFI Model
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IRFI extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  rfiNumber: string;
  subject: string;
  question: string;
  raisedBy: mongoose.Types.ObjectId;
  assignedTo: mongoose.Types.ObjectId;
  dueDate: Date;
  status: 'open' | 'responded' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  response?: string;
  respondedBy?: mongoose.Types.ObjectId;
  respondedAt?: Date;
  attachments: string[];
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RFISchema = new Schema<IRFI>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    rfiNumber: { type: String, required: true },
    subject: { type: String, required: true, trim: true },
    question: { type: String, required: true, trim: true },
    raisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['open', 'responded', 'closed'],
      default: 'open',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },
    response: { type: String, trim: true },
    respondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    respondedAt: { type: Date },
    attachments: [{ type: String }],
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

RFISchema.index({ organizationId: 1, projectId: 1, rfiNumber: 1 }, { unique: true });

RFISchema.pre('find', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

RFISchema.pre('findOne', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

export const RFI: Model<IRFI> = mongoose.models.RFI || mongoose.model<IRFI>('RFI', RFISchema);
export default RFI;
