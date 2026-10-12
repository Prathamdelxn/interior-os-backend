// =============================================================================
// InteriorOS Backend — Snag Model
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISnag extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  location?: string;
  description: string;
  photos: string[];
  assignee?: mongoose.Types.ObjectId;
  drawingId?: mongoose.Types.ObjectId;
  drawingTitle?: string;
  drawingNumber?: string;
  annotationId?: string;
  pinNumber?: number;
  x?: number;
  y?: number;
  source?: 'direct' | 'drawing_annotation';
  status: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'verified' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SnagSchema = new Schema<ISnag>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    location: { type: String, trim: true },
    description: { type: String, required: true, trim: true },
    photos: [{ type: String }],
    assignee: { type: Schema.Types.ObjectId, ref: 'User' },
    drawingId: { type: Schema.Types.ObjectId, ref: 'Drawing', index: true },
    drawingTitle: { type: String, trim: true },
    drawingNumber: { type: String, trim: true },
    annotationId: { type: String, index: true },
    pinNumber: { type: Number },
    x: { type: Number },
    y: { type: Number },
    source: { type: String, enum: ['direct', 'drawing_annotation'], default: 'direct' },
    status: {
      type: String,
      enum: ['open', 'assigned', 'in_progress', 'resolved', 'verified', 'closed'],
      default: 'open',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },
    dueDate: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

SnagSchema.pre('find', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

SnagSchema.pre('findOne', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

export const Snag: Model<ISnag> = mongoose.models.Snag || mongoose.model<ISnag>('Snag', SnagSchema);
export default Snag;
