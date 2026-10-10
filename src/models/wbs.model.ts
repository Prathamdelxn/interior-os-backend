// =============================================================================
// InteriorOS Backend — WBS Hierarchy Models
// =============================================================================

import mongoose, { Schema, Document, Model } from 'mongoose';

// ── Building Interface & Model ──────────────────────────────────────────────
export interface IBuilding extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  status?: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const BuildingSchema = new Schema<IBuilding>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    startDate: { type: Date },
    endDate: { type: Date },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

// ── Floor Interface & Model ─────────────────────────────────────────────────
export interface IFloor extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  buildingId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  status?: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const FloorSchema = new Schema<IFloor>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    startDate: { type: Date },
    endDate: { type: Date },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

// ── Zone Interface & Model ──────────────────────────────────────────────────
export interface IZone extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  floorId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  status?: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const ZoneSchema = new Schema<IZone>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    floorId: { type: Schema.Types.ObjectId, ref: 'Floor', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    startDate: { type: Date },
    endDate: { type: Date },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

// ── Area Interface & Model ──────────────────────────────────────────────────
export interface IArea extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  zoneId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  status?: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const AreaSchema = new Schema<IArea>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    zoneId: { type: Schema.Types.ObjectId, ref: 'Zone', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    startDate: { type: Date },
    endDate: { type: Date },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

// ── Package Interface & Model ───────────────────────────────────────────────
export interface IPackage extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  areaId: mongoose.Types.ObjectId;
  name: string;
  trade: 'civil' | 'interior' | 'mep' | 'electrical' | 'hvac' | 'phe' | 'fire_fighting' | 'elv' | 'other';
  description?: string;
  startDate?: Date;
  endDate?: Date;
  status?: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const PackageSchema = new Schema<IPackage>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    areaId: { type: Schema.Types.ObjectId, ref: 'Area', required: true, index: true },
    name: { type: String, required: true, trim: true },
    trade: {
      type: String,
      enum: ['civil', 'interior', 'mep', 'electrical', 'hvac', 'phe', 'fire_fighting', 'elv', 'other'],
      default: 'interior',
    },
    description: { type: String, trim: true, default: '' },
    startDate: { type: Date },
    endDate: { type: Date },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

// Ensure fresh schema models on dev hot reload
delete (mongoose.models as any).Building;
delete (mongoose.models as any).Floor;
delete (mongoose.models as any).Zone;
delete (mongoose.models as any).Area;
delete (mongoose.models as any).Package;

// Exports
export const Building: Model<IBuilding> = mongoose.models.Building || mongoose.model<IBuilding>('Building', BuildingSchema);
export const Floor: Model<IFloor> = mongoose.models.Floor || mongoose.model<IFloor>('Floor', FloorSchema);
export const Zone: Model<IZone> = mongoose.models.Zone || mongoose.model<IZone>('Zone', ZoneSchema);
export const Area: Model<IArea> = mongoose.models.Area || mongoose.model<IArea>('Area', AreaSchema);
export const Package: Model<IPackage> = mongoose.models.Package || mongoose.model<IPackage>('Package', PackageSchema);
