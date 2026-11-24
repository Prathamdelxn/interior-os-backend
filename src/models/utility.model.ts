// =============================================================================
// InteriorOS Backend — Utility System Model
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUtilityCheckpoint {
  name: string;
  status: 'pending' | 'passed' | 'failed';
  readings?: string;
  checkedAt?: Date;
}

export interface IUtilitySystem extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  /** Stable slug key (unique per project). Free-form: systems come from project scope or are added by the team. */
  system: string;
  /** Display name, e.g. "HVAC", "Kitchen Gas Line". Falls back to the key for older rows. */
  label?: string;
  /** Kept on the list but excluded from progress (e.g. no STP on this job). */
  notApplicable: boolean;
  /** 'auto' = detected from project scope, 'manual' = added by the team. */
  source: 'auto' | 'manual';
  order: number;
  plannedProgress: number;
  actualProgress: number;
  checkpoints: IUtilityCheckpoint[];
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UtilitySystemSchema = new Schema<IUtilitySystem>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    system: { type: String, required: true, trim: true, index: true },
    label: { type: String, trim: true },
    notApplicable: { type: Boolean, default: false },
    source: { type: String, enum: ['auto', 'manual'], default: 'manual' },
    order: { type: Number, default: 0 },
    plannedProgress: { type: Number, default: 0, min: 0, max: 100 },
    actualProgress: { type: Number, default: 0, min: 0, max: 100 },
    checkpoints: [
      {
        name: { type: String, required: true },
        status: {
          type: String,
          enum: ['pending', 'passed', 'failed'],
          default: 'pending',
        },
        readings: String,
        checkedAt: Date,
      },
    ],
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

UtilitySystemSchema.index({ organizationId: 1, projectId: 1, system: 1 }, { unique: true });

UtilitySystemSchema.pre('find', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

UtilitySystemSchema.pre('findOne', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

export const UtilitySystem: Model<IUtilitySystem> = mongoose.models.UtilitySystem || mongoose.model<IUtilitySystem>('UtilitySystem', UtilitySystemSchema);
export default UtilitySystem;
//
