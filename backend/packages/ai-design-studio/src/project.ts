import { type DiagramGraph, type DiagramTypeName } from './schema.js';
import { type SystemModelType } from './workspace.js';
export const generationTypes = [
  'hld',
  'uml_class',
  'sequence',
  'activity',
  'use_case',
  'component',
  'deployment',
] as const;
export type GeneratedDiagramType = (typeof generationTypes)[number];
export type PublicDiagramType =
  'architecture' | 'class' | 'sequence' | 'activity' | 'usecase' | 'component' | 'deployment';
export const publicTypes: Record<GeneratedDiagramType, PublicDiagramType> = {
  hld: 'architecture',
  uml_class: 'class',
  sequence: 'sequence',
  activity: 'activity',
  use_case: 'usecase',
  component: 'component',
  deployment: 'deployment',
};
export const isGenerationType = (type: DiagramTypeName): type is GeneratedDiagramType =>
  (generationTypes as readonly string[]).includes(type);
export interface DiagramDocument {
  id: string;
  type: PublicDiagramType;
  title: string;
  graph: DiagramGraph;
  canvas: Record<string, unknown> | null;
}
export interface GeneratedSystemDesign {
  id: string;
  prompt: string;
  specification: SystemModelType;
  diagrams: Record<PublicDiagramType, DiagramDocument>;
}
