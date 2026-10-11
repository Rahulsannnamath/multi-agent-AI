// apps/api/src/db/models/project.model.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IProjectDocument extends Document {
  projectId: string;
  projectName: string;
  originalPrompt: string;
  status: string;
  currentStage: string;
  provider: string;
  llmModel: string;
  autonomousMode: boolean;
  maxArchitectureIterations: number;
  maxDebugIterations: number;
  maxAgentRetries: number;
  requireApprovals: boolean;
  state: Record<string, unknown>; // Full ProjectState JSON
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProjectDocument>(
  {
    projectId: { type: String, required: true, unique: true, index: true },
    projectName: { type: String, required: true },
    originalPrompt: { type: String, required: true },
    status: { type: String, default: 'pending' },
    currentStage: { type: String, default: 'INTAKE' },
    provider: { type: String, required: true },
    llmModel: { type: String, required: true },
    autonomousMode: { type: Boolean, default: true },
    maxArchitectureIterations: { type: Number, default: 3 },
    maxDebugIterations: { type: Number, default: 5 },
    maxAgentRetries: { type: Number, default: 3 },
    requireApprovals: { type: Boolean, default: false },
    state: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const ProjectModel = mongoose.model<IProjectDocument>('Project', ProjectSchema);
