// =============================================================================
// InteriorOS Backend — CRM Activity Model (ported from sky-lite-api Activity)
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICrmActivityAttachment {
  url?: string;
  name?: string;
  mimeType?: string;
}

export interface ICrmActivity extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  customer: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;

  type:
    | 'Phone Call'
    | 'WhatsApp'
    | 'Meeting'
    | 'Office Visit'
    | 'Site Visit'
    | 'Site Survey'
    | 'Email'
    | 'Status Change'
    | 'System Update'
    | 'Requirement Gathering'
    | '2D/3D Drawing'
    | 'Design Shared';

  status: 'Completed' | 'Pending' | 'Missed';

  scheduledDate?: Date;
  completedDate?: Date;

  remarks?: string;
  customerResponse?: string;

  nextFollowUpDate?: Date;
  reminderSet: boolean;
  priority: 'Low' | 'Medium' | 'High';

  attachments: ICrmActivityAttachment[];

  createdAt: Date;
  updatedAt: Date;
}

const CrmActivityAttachmentSchema = new Schema<ICrmActivityAttachment>(
  {
    url: String,
    name: String,
    mimeType: String,
  },
  { _id: false }
);

const CrmActivitySchema = new Schema<ICrmActivity>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required'],
      index: true,
    },
    customer: { type: Schema.Types.ObjectId, ref: 'CrmCustomer', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: {
      type: String,
      enum: [
        'Phone Call',
        'WhatsApp',
        'Meeting',
        'Office Visit',
        'Site Visit',
        'Site Survey',
        'Email',
        'Status Change',
        'System Update',
        'Requirement Gathering',
        '2D/3D Drawing',
        'Design Shared',
      ],
      required: true,
    },

    status: {
      type: String,
      enum: ['Completed', 'Pending', 'Missed'],
      default: 'Completed',
    },

    scheduledDate: { type: Date },
    completedDate: { type: Date },

    remarks: { type: String },
    customerResponse: { type: String },

    nextFollowUpDate: { type: Date },
    reminderSet: { type: Boolean, default: false },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },

    attachments: [CrmActivityAttachmentSchema],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

if (mongoose.models && (mongoose.models as any).CrmActivity) {
  delete (mongoose.models as any).CrmActivity;
}

export const CrmActivity: Model<ICrmActivity> =
  mongoose.models.CrmActivity || mongoose.model<ICrmActivity>('CrmActivity', CrmActivitySchema);

export default CrmActivity;
