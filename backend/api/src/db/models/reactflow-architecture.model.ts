// apps/api/src/db/models/reactflow-architecture.model.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IReactFlowArchitectureDocument extends Document {
  architectureId: string;
  name: string;
  description?: string;
  version: number;
  requirements: string[];
  nodes: any[];
  edges: any[];
  createdAt: Date;
  updatedAt: Date;
}

const ReactFlowArchitectureSchema = new Schema<IReactFlowArchitectureDocument>(
  {
    architectureId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, default: 'Untitled Architecture' },
    description: { type: String, default: '' },
    version: { type: Number, default: 1 },
    requirements: { type: [String], default: [] },
    nodes: { type: [Schema.Types.Mixed], default: [] },
    edges: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

ReactFlowArchitectureSchema.index({ updatedAt: -1 });

export const ReactFlowArchitectureModel = mongoose.model<IReactFlowArchitectureDocument>(
  'ReactFlowArchitecture',
  ReactFlowArchitectureSchema
);
