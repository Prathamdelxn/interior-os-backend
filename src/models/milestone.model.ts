// =============================================================================
// InteriorOS Backend — Milestone & MilestoneDelay Models
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

// ── Milestone Delay Interface & Schema ───────────────────────────────────────
export interface IMilestoneDelay extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  milestoneId: mongoose.Types.ObjectId;
  reason: string;
  impactDays: number;
  originalDate: Date;
  newDate: Date;
  approvedBy?: mongoose.Types.ObjectId;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const MilestoneDelaySchema = new Schema<IMilestoneDelay>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    milestoneId: { type: Schema.Types.ObjectId, ref: 'Milestone', required: true, index: true },
    reason: { type: String, required: true, trim: true },
    impactDays: { type: Number, required: true, min: 1 },
    originalDate: { type: Date, required: true },
    newDate: { type: Date, required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  },
  { timestamps: true }
);

// ── Milestone Interface & Schema ─────────────────────────────────────────────
export interface IMilestone extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  name: string;
  dueDate: Date;
  status: 'planned' | 'achieved' | 'delayed';
  linkedTasks: mongoose.Types.ObjectId[];
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MilestoneSchema = new Schema<IMilestone>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    name: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ['planned', 'achieved', 'delayed'], default: 'planned', index: true },
    linkedTasks: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Pre-query soft delete filters
MilestoneSchema.pre('find', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

MilestoneSchema.pre('findOne', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

// Exports
MilestoneSchema.index({ projectId: 1, organizationId: 1, isDeleted: 1, dueDate: 1 });
MilestoneDelaySchema.index({ projectId: 1, organizationId: 1, milestoneId: 1 });

export const MilestoneDelay: Model<IMilestoneDelay> = mongoose.models.MilestoneDelay || mongoose.model<IMilestoneDelay>('MilestoneDelay', MilestoneDelaySchema);
export const Milestone: Model<IMilestone> = mongoose.models.Milestone || mongoose.model<IMilestone>('Milestone', MilestoneSchema);
