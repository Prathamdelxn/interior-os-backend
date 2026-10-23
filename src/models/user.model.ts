// =============================================================================
// InteriorOS Backend — User Model
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  fullName: string;
  name?: string;
  avatar?: string;
  phone?: string;
  designation?: string;
  department?: string;
  role: mongoose.Types.ObjectId;
  systemRole: 'super_admin' | 'org_admin' | 'manager' | 'member' | 'viewer';
  status: 'active' | 'inactive' | 'suspended' | 'pending';
  isEmailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpiry?: Date;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  lastLoginAt?: Date;
  lastActiveAt?: Date;
  preferences: {
    theme: 'light' | 'dark' | 'system';
    language: string;
    timezone: string;
    notifications: {
      email: boolean;
      inApp: boolean;
      push: boolean;
    };
  };
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required'],
      index: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false, // Don't return password by default
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      minlength: 1,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      minlength: 1,
      maxlength: 50,
    },
    avatar: { type: String },
    phone: { type: String, trim: true },
    designation: { type: String, trim: true },
    department: { type: String, trim: true },
    role: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
    },
    systemRole: {
      type: String,
      enum: ['super_admin', 'org_admin', 'manager', 'member', 'viewer'],
      default: 'member',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'pending'],
      default: 'pending',
      index: true,
    },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpiry: { type: Date, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpiry: { type: Date, select: false },
    lastLoginAt: { type: Date },
    lastActiveAt: { type: Date },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      language: { type: String, default: 'en' },
      timezone: { type: String, default: 'Asia/Kolkata' },
      notifications: {
        email: { type: Boolean, default: true },
        inApp: { type: Boolean, default: true },
        push: { type: Boolean, default: false },
      },
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.password;
        delete ret.emailVerificationToken;
        delete ret.emailVerificationExpiry;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpiry;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Indexes
UserSchema.index({ organizationId: 1, email: 1 });
UserSchema.index({ organizationId: 1, status: 1 });
UserSchema.index({ organizationId: 1, systemRole: 1 });
UserSchema.index({ firstName: 'text', lastName: 'text', email: 'text' });

// Virtual: fullName & name
UserSchema.virtual('fullName').get(function (this: IUser) {
  return `${this.firstName} ${this.lastName}`.trim();
});

UserSchema.virtual('name').get(function (this: IUser) {
  return `${this.firstName} ${this.lastName}`.trim();
});

// Pre-save: Hash password
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Soft delete filter
UserSchema.pre('find', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

UserSchema.pre('findOne', function () {
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: false });
  }
});

// Methods
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
