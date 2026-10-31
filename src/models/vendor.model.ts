import mongoose, { Schema, Document } from 'mongoose';

export interface IVendor extends Document {
  vendorCode?: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phoneNumber?: string;
  gstNumber?: string;
  vendorCategory?: string;
  bankDetails?: {
    accountName?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
  };
  address?: string;
  paymentTerms?: string;
  organizationId: mongoose.Types.ObjectId;
  status: string;
}

const VendorSchema = new Schema<IVendor>(
  {
    vendorCode: {
      type: String,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Please provide a vendor name'],
      trim: true,
    },
    contactPerson: { type: String, trim: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: function (v: string) {
          if (!v || v.trim() === '') return true;
          return /^\S+@\S+\.\S+$/.test(v);
        },
        message: 'Please provide a valid email',
      },
    },
    phoneNumber: { type: String, trim: true },
    gstNumber: { type: String, trim: true },
    vendorCategory: {
      type: String,
      enum: ['Raw Materials', 'Furniture', 'Electrical', 'Labour', 'Paint', 'Other'],
      default: 'Other',
    },
    bankDetails: {
      accountName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      ifscCode: { type: String, trim: true },
      bankName: { type: String, trim: true },
    },
    address: { type: String, trim: true },
    paymentTerms: { type: String, trim: true, default: 'Standard' },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete (ret as any).__v;
        return ret;
      },
    },
  }
);

if (mongoose.models && mongoose.models.Vendor) {
  delete (mongoose.models as any).Vendor;
}
export const Vendor = mongoose.models.Vendor || mongoose.model<IVendor>('Vendor', VendorSchema);
