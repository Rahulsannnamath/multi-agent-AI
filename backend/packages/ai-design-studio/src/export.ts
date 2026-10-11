import { isUml, type DiagramGraph, type UmlAttribute, type UmlMethod } from './schema.js';
export const visibility = { public: '+', private: '-', protected: '#', package: '~' };
export function attributeLabel(a: UmlAttribute) { return `${visibility[a.visibility]} ${a.name}: ${a.type}`; }
export function methodLabel(m: UmlMethod) { return `${visibility[m.visibility]} ${m.name}(${m.parameters.map(p => `${p.name}: ${p.type}`).join(', ')}): ${m.returnType}`; }
export function umlExport(graph: DiagramGraph, format: 'mermaid' | 'plantuml') {
  if (graph.components.some(c => !isUml(c.kind)) || graph.connections.some(c => c.kind === 'flow')) throw new Error('UML text export requires only UML components and relationships. Use JSON or SVG for mixed/HLD diagrams.');
  const safe = (s: string) => s.replace(/[\r\n{}"<>;]/g, ' ').replace(/@(?:start|end)uml/gi, '').trim();
  const alias = new Map(graph.components.map((c, i) => [c.id, `C${i}`]));
  const lines = [format === 'mermaid' ? 'classDiagram' : '@startuml'];
  const warnings = ['Freehand annotations, styling, grouping, coordinates and viewport are represented only in JSON/PNG/SVG.'];
  for (const c of graph.components) {
    const id = alias.get(c.id)!;
    lines.push(format === 'mermaid' ? `class ${id}["${safe(c.name)}"] {` : `${c.kind === 'abstract' ? 'abstract class' : c.kind === 'interface' ? 'interface' : c.kind === 'enum' ? 'enum' : 'class'} "${safe(c.name)}" as ${id} ${c.stereotype ? `<<${safe(c.stereotype)}>>` : ''} {`);
    if (format === 'mermaid' && (c.kind !== 'class' || c.stereotype)) lines.push(`  <<${safe(c.stereotype || c.kind)}>>`);
    for (const a of c.attributes) lines.push(`  ${format === 'plantuml' ? (a.isStatic ? '{static} ' : '') + (a.isAbstract ? '{abstract} ' : '') : ''}${safe(attributeLabel(a))}${format === 'mermaid' ? (a.isStatic ? '$' : '') + (a.isAbstract ? '*' : '') : ''}`);
    for (const m of c.methods) lines.push(`  ${format === 'plantuml' ? (m.isStatic ? '{static} ' : '') + (m.isAbstract ? '{abstract} ' : '') : ''}${safe(methodLabel(m))}${format === 'mermaid' ? (m.isStatic ? '$' : '') + (m.isAbstract ? '*' : '') : ''}`);
    lines.push('}');
  }
  for (const e of graph.connections) {
    const markers: Record<string, string> = { association: '--', generalization: '--|>', realization: '..|>', dependency: '..>', aggregation: 'o--', composition: '*--' };
    let connector = markers[e.kind];
    if (e.kind === 'association') connector = e.navigability === 'both' ? '<-->' : e.navigability === 'source' ? '<--' : e.navigability === 'target' ? '-->' : '--';
    const start = e.sourceMultiplicity ? ` "${safe(e.sourceMultiplicity)}"` : '';
    const end = e.targetMultiplicity ? `"${safe(e.targetMultiplicity)}" ` : '';
    const label = [e.name, e.sourceRole && `source: ${e.sourceRole}`, e.targetRole && `target: ${e.targetRole}`].filter(Boolean).join(' / ');
    lines.push(`${alias.get(e.source)}${start} ${connector} ${end}${alias.get(e.target)}${label ? ` : ${safe(label)}` : ''}`);
    if (e.sourceRole || e.targetRole) warnings.push(`Relationship ${e.id}: endpoint role names are included in the label, not positioned at endpoints.`);
    if (e.protocol || e.asynchronous) warnings.push(`Relationship ${e.id}: architecture protocol/asynchronous metadata is available in JSON only.`);
    if (e.kind !== 'association' && e.navigability !== 'none') warnings.push(`Relationship ${e.id}: additional navigability markers are not represented in this text export.`);
  }
  if (format === 'plantuml') lines.push('@enduml');
  return { text: lines.join('\n'), warnings: [...new Set(warnings)] };
}
