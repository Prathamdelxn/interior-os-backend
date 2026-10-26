// =============================================================================
// InteriorOS Backend — Project Model
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProject extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  name: string;
  code: string;
  client: string;
  type: 'Commercial Office' | 'Residential' | 'Tech Office' | 'Co-working Space' | 'General';
  status: 'active' | 'inactive' | 'completed' | 'on-hold';
  startDate: Date;
  endDate: Date;
  budget: {
    amount: number;
    currency: string;
  };
  location: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  };
  description?: string;
  threeDModelUrl?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Project code is required'],
      trim: true,
    },
    client: {
      type: String,
      required: [true, 'Client name is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['Commercial Office', 'Residential', 'Tech Office', 'Co-working Space', 'General'],
      default: 'General',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'completed', 'on-hold'],
      default: 'active',
      index: true,
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    budget: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: 'INR' },
    },
    location: {
      address: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
    },
    description: { type: String },
    threeDModelUrl: { type: String },
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
ProjectSchema.index({ organizationId: 1, code: 1 }, { unique: true });
ProjectSchema.index({ name: 'text', client: 'text', code: 'text' });

// Soft delete query filter
ProjectSchema.pre('find', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

ProjectSchema.pre('findOne', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

export const Project: Model<IProject> =
  mongoose.models.Project || mongoose.model<IProject>('Project', ProjectSchema);

export default Project;
