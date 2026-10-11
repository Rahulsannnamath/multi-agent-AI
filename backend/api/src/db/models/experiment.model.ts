// apps/api/src/db/models/experiment.model.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IExperimentDocument extends Document {
  experimentId: string;
  name: string;
  description?: string;
  inputPrompt: string;
  ollamaModel: string;
  openaiModel: string;
  configuration?: Record<string, unknown>;
  ollamaProjectId?: string;
  openaiProjectId?: string;
  ollamaMetrics?: Record<string, unknown>;
  openaiMetrics?: Record<string, unknown>;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const ExperimentSchema = new Schema<IExperimentDocument>(
  {
    experimentId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    inputPrompt: { type: String, required: true },
    ollamaModel: { type: String, required: true },
    openaiModel: { type: String, required: true },
    configuration: { type: Schema.Types.Mixed },
    ollamaProjectId: { type: String },
    openaiProjectId: { type: String },
    ollamaMetrics: { type: Schema.Types.Mixed },
    openaiMetrics: { type: Schema.Types.Mixed },
    status: { type: String, default: 'pending' },
  },
  { timestamps: true }
);

export const ExperimentModel = mongoose.model<IExperimentDocument>('Experiment', ExperimentSchema);
