// =============================================================================
// InteriorOS Backend — Drawing Model
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDrawingAttachment {
  name: string;
  url: string;
  type: 'image' | 'video' | 'audio' | 'file';
  size?: number;
}

export interface IDrawingAnnotation {
  id: string;
  pinNumber?: number;
  versionNumber?: number;
  x: number;
  y: number;
  text: string;
  type?: 'comment' | 'issue' | 'snag' | 'revision' | 'approved';
  attachments?: IDrawingAttachment[];
  author?: {
    name: string;
    email?: string;
    avatar?: string;
  };
  resolved?: boolean;
  createdAt: Date;
}

export interface IDrawingRevision {
  revision: string;
  url: string;
  uploadedBy: mongoose.Types.ObjectId;
  changes?: string;
  createdAt: Date;
}

export interface IDrawing extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  drawingNumber: string;
  title: string;
  drawingType: '2D' | '3D';
  discipline: string;
  fileType?: string;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
  revisions: IDrawingRevision[];
  annotations?: IDrawingAnnotation[];
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DrawingSchema = new Schema<IDrawing>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    drawingNumber: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    drawingType: {
      type: String,
      enum: ['2D', '3D'],
      default: '2D',
      index: true,
    },
    discipline: {
      type: String,
      default: 'gfc',
      index: true,
    },
    fileType: { type: String },
    status: {
      type: String,
      enum: ['draft', 'submitted', 'under_review', 'approved', 'rejected'],
      default: 'draft',
      index: true,
    },
    revisions: [
      {
        revision: { type: String, required: true },
        url: { type: String, required: true },
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        changes: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    annotations: [
      {
        id: { type: String },
        pinNumber: { type: Number },
        versionNumber: { type: Number },
        x: { type: Number, required: true },
        y: { type: Number, required: true },
        text: { type: String, default: '' },
        type: { type: String, default: 'comment' },
        attachments: [
          {
            name: { type: String },
            url: { type: String },
            type: { type: String, enum: ['image', 'video', 'audio', 'file'], default: 'image' },
            size: { type: Number },
          },
        ],
        author: {
          name: { type: String },
          email: { type: String },
          avatar: { type: String },
        },
        resolved: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
      { _id: false }
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

DrawingSchema.index({ organizationId: 1, projectId: 1, drawingNumber: 1 }, { unique: true });

DrawingSchema.pre('find', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

DrawingSchema.pre('findOne', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

if (mongoose.models.Drawing) {
  delete (mongoose.models as any).Drawing;
}

export const Drawing: Model<IDrawing> = mongoose.models.Drawing || mongoose.model<IDrawing>('Drawing', DrawingSchema);
export default Drawing;
//
