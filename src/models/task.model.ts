// =============================================================================
// InteriorOS Backend — Task, TaskComment, TaskAttachment Models
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

// ── Task Comment Interface & Schema ──────────────────────────────────────────
export interface ITaskComment extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  taskId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  content: string;
  attachments: Array<{
    name: string;
    url: string;
    size?: number;
    type?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const TaskCommentSchema = new Schema<ITaskComment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, trim: true },
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        size: Number,
        type: String,
      },
    ],
  },
  { timestamps: true }
);

// ── Task Attachment Interface & Schema ───────────────────────────────────────
export interface ITaskAttachment extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  taskId: mongoose.Types.ObjectId;
  name: string;
  url: string;
  size: number;
  type: string;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TaskAttachmentSchema = new Schema<ITaskAttachment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    size: { type: Number, required: true },
    type: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// ── Task Interface & Schema ──────────────────────────────────────────────────
export interface ISubtask {
  _id?: mongoose.Types.ObjectId;
  title: string;
  completed: boolean;
  dueDate?: Date;
  assignedTo?: mongoose.Types.ObjectId;
}

export interface ICompletionProofImage {
  url: string;
  name?: string;
  size?: number;
  uploadedAt?: Date;
}

export interface IMaterialUsage {
  inventoryId?: mongoose.Types.ObjectId;
  materialName: string;
  quantity: number;
  unit: string;
  notes?: string;
}

export interface ICompletionProof {
  images: ICompletionProofImage[];
  notes?: string;
  materialUsage?: IMaterialUsage[];
  completedAt?: Date;
  completedBy?: mongoose.Types.ObjectId;
}

export interface ITask extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  packageId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  startDate?: Date;
  endDate?: Date;
  assignees: mongoose.Types.ObjectId[];
  progress: number;
  dependencies: mongoose.Types.ObjectId[];
  subtasks: ISubtask[];
  completionProof?: ICompletionProof;
  isMilestone?: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SubtaskSchema = new Schema<ISubtask>(
  {
    title: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
    dueDate: Date,
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true, timestamps: true }
);

const CompletionProofImageSchema = new Schema<ICompletionProofImage>(
  {
    url: { type: String, required: true, trim: true },
    name: { type: String, trim: true },
    size: Number,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MaterialUsageSchema = new Schema<IMaterialUsage>(
  {
    inventoryId: { type: Schema.Types.ObjectId, ref: 'Inventory' },
    materialName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, default: 'units', trim: true },
    notes: { type: String, trim: true },
  },
  { _id: false }
);

const CompletionProofSchema = new Schema<ICompletionProof>(
  {
    images: { type: [CompletionProofImageSchema], default: [] },
    notes: { type: String, trim: true },
    materialUsage: { type: [MaterialUsageSchema], default: [] },
    completedAt: { type: Date, default: Date.now },
    completedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const TaskSchema = new Schema<ITask>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    packageId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: String,
    status: {
      type: String,
      enum: ['backlog', 'todo', 'in_progress', 'in_review', 'completed'],
      default: 'todo',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },
    startDate: Date,
    endDate: Date,
    assignees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    progress: { type: Number, default: 0, min: 0, max: 100 },
    dependencies: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
    subtasks: { type: [SubtaskSchema], default: [] },
    completionProof: { type: CompletionProofSchema, default: null },
    isMilestone: { type: Boolean, default: false, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
TaskSchema.index({ name: 'text', description: 'text' });

// Pre-query soft delete filters
TaskSchema.pre('find', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

TaskSchema.pre('findOne', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

// Exports
export const TaskComment: Model<ITaskComment> = mongoose.models.TaskComment || mongoose.model<ITaskComment>('TaskComment', TaskCommentSchema);
export const TaskAttachment: Model<ITaskAttachment> = mongoose.models.TaskAttachment || mongoose.model<ITaskAttachment>('TaskAttachment', TaskAttachmentSchema);
export const Task: Model<ITask> = mongoose.models.Task || mongoose.model<ITask>('Task', TaskSchema);
