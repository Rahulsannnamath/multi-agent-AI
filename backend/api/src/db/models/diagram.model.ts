// apps/api/src/db/models/diagram.model.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IDiagramDocument extends Document {
  diagramId: string;
  name: string;
  diagramXml: string;
  thumbnail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const DiagramSchema = new Schema<IDiagramDocument>(
  {
    diagramId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, default: 'Untitled Diagram' },
    diagramXml: {
      type: String,
      required: true,
      default: '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>',
    },
    thumbnail: { type: String, default: null },
  },
  { timestamps: true }
);

// Index for listing diagrams sorted by recency
DiagramSchema.index({ updatedAt: -1 });

export const DiagramModel = mongoose.model<IDiagramDocument>('Diagram', DiagramSchema);
