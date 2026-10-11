// apps/api/src/db/models/generatedapp.model.ts
// Mongoose model for quick-generated apps (structured generation + Docker preview).

import mongoose, { Schema, Document } from 'mongoose';

export interface IGeneratedAppDocument extends Document {
  appId: string;
  prompt: string;
  provider: 'openai' | 'bedrock';
  status: 'generating' | 'generated' | 'building' | 'running' | 'stopped' | 'failed' | 'error';
  filePaths: string[];
  previewUrl: string | null;
  previewPort: number | null;
  fixAttempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const GeneratedAppSchema = new Schema<IGeneratedAppDocument>(
  {
    appId: { type: String, required: true, unique: true, index: true },
    prompt: { type: String, required: true },
    provider: { type: String, enum: ['openai', 'bedrock'], default: 'openai' },
    status: {
      type: String,
      enum: ['generating', 'generated', 'building', 'running', 'stopped', 'failed', 'error'],
      default: 'generating',
    },
    filePaths: { type: [String], default: [] },
    previewUrl: { type: String, default: null },
    previewPort: { type: Number, default: null },
    fixAttempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
  },
  { timestamps: true },
);

export const GeneratedAppModel = mongoose.model<IGeneratedAppDocument>('GeneratedApp', GeneratedAppSchema);
