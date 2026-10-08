// =============================================================================
// InteriorOS Backend — Payment Model
// Handles Incoming (client receipts), Outgoing (vendor payouts), & Debit Notes
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

export type PaymentType = 'incoming' | 'outgoing' | 'debit_note';
export type PaymentMethod = 'Bank Transfer' | 'UPI' | 'Cheque' | 'Cash' | 'RTGS/NEFT';
export type IncomingStatus = 'Completed' | 'Pending Verification';
export type OutgoingStatus = 'Paid' | 'Processing';
export type DebitNoteStatus = 'Issued' | 'Adjusted' | 'Settled';

export interface IPayment extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  type: PaymentType;

  // Auto-generated reference numbers
  invoiceNo?: string;   // For incoming
  poNo?: string;        // For outgoing
  debitNoteNo?: string; // For debit note

  // Project details
  projectName?: string;
  projectLocation?: string;

  // Common fields
  amount: number;
  paymentMethod?: PaymentMethod;
  referenceNo?: string;
  remarks?: string;

  // Incoming specific
  milestoneName?: string;
  paymentDate?: Date;
  incomingStatus?: IncomingStatus;

  // Outgoing specific
  vendorName?: string;
  category?: string;
  outgoingStatus?: OutgoingStatus;

  // Debit note specific
  reason?: string;
  issueDate?: Date;
  debitNoteStatus?: DebitNoteStatus;

  recordedBy: mongoose.Types.ObjectId;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    type: { type: String, enum: ['incoming', 'outgoing', 'debit_note'], required: true, index: true },

    invoiceNo: { type: String, trim: true },
    poNo: { type: String, trim: true },
    debitNoteNo: { type: String, trim: true },

    projectName: { type: String, trim: true },
    projectLocation: { type: String, trim: true },

    amount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ['Bank Transfer', 'UPI', 'Cheque', 'Cash', 'RTGS/NEFT'] },
    referenceNo: { type: String, trim: true },
    remarks: { type: String, trim: true },

    // Incoming
    milestoneName: { type: String, trim: true },
    paymentDate: { type: Date },
    incomingStatus: { type: String, enum: ['Completed', 'Pending Verification'] },

    // Outgoing
    vendorName: { type: String, trim: true },
    category: { type: String, trim: true },
    outgoingStatus: { type: String, enum: ['Paid', 'Processing'] },

    // Debit Note
    reason: { type: String, trim: true },
    issueDate: { type: Date },
    debitNoteStatus: { type: String, enum: ['Issued', 'Adjusted', 'Settled'] },

    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Auto-exclude soft-deleted records
PaymentSchema.pre('find', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

PaymentSchema.pre('findOne', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

export const Payment: Model<IPayment> =
  mongoose.models.Payment || mongoose.model<IPayment>('Payment', PaymentSchema);

export default Payment;
