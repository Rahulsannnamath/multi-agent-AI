import { z } from 'zod';

export const Id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const Text = z.string().max(4000);
export const DiagramType = z.enum(['uml_class','sequence','activity','hld','use_case','state_machine','deployment','component']);
export type DiagramTypeName = z.infer<typeof DiagramType>;
export const diagramLabels: Record<DiagramTypeName,string> = { uml_class:'Class',sequence:'Sequence',activity:'Activity',hld:'Architecture',use_case:'Use Case',state_machine:'State Machine',deployment:'Deployment',component:'Component' };
export const Visibility = z.enum(['public','private','protected','package']);
export const Parameter = z.object({ name:Text,type:Text }).strict();
export const Attribute = z.object({ id:Id,name:Text.min(1),type:Text,visibility:Visibility,isStatic:z.boolean(),isAbstract:z.boolean() }).strict();
export const Method = z.object({ id:Id,name:Text.min(1),parameters:z.array(Parameter).max(30),returnType:Text,visibility:Visibility,isStatic:z.boolean(),isAbstract:z.boolean() }).strict();
export const Kind = z.enum(['class','interface','abstract','enum','client','dns','cdn','load_balancer','api_gateway','auth','server','microservice','database','nosql','cache','queue','kafka','worker','search','storage','monitoring','external','boundary','custom','actor','participant','activation','fragment','start','end','action','decision','merge','fork','join','swimlane','use_case','state','initial_state','final_state','composite_state','device','execution_environment','artifact','component','provided_interface','required_interface']);
export const kindsByType: Record<DiagramTypeName,readonly z.infer<typeof Kind>[]> = {
  uml_class:['class','interface','abstract','enum'],sequence:['actor','participant','activation','fragment'],activity:['start','end','action','decision','merge','fork','join','swimlane'],
  hld:['client','dns','cdn','load_balancer','api_gateway','auth','server','microservice','database','nosql','cache','queue','kafka','worker','search','storage','monitoring','external','boundary','custom'],
  use_case:['actor','use_case','boundary'],state_machine:['state','initial_state','final_state','composite_state'],deployment:['device','execution_environment','artifact'],component:['component','provided_interface','required_interface','boundary']
};
export const containerKinds = ['boundary','swimlane','composite_state','device','execution_environment'] as const;
export function isContainer(kind:string) { return (containerKinds as readonly string[]).includes(kind); }
export function isUml(kind:string) { return ['class','interface','abstract','enum'].includes(kind); }
export const Component = z.object({ id:Id,kind:Kind,name:Text.min(1),description:Text,stereotype:Text,attributes:z.array(Attribute).max(100),methods:z.array(Method).max(100),parentId:Id.nullable(),entityId:Id.nullable().default(null),order:z.number().int().nonnegative().default(0),startOrder:z.number().int().nonnegative().default(0),endOrder:z.number().int().nonnegative().default(0),condition:Text.default('') }).strict();
export const Relationship = z.enum(['association','generalization','realization','dependency','aggregation','composition','flow','sync_message','async_message','return_message','control_flow','include','extend','transition','deployment','communication']);
export const relationsByType: Record<DiagramTypeName,readonly z.infer<typeof Relationship>[]> = { uml_class:['association','generalization','realization','dependency','aggregation','composition'],hld:['flow'],sequence:['sync_message','async_message','return_message'],activity:['control_flow'],use_case:['association','include','extend','generalization'],state_machine:['transition'],deployment:['deployment','communication'],component:['dependency','realization','association'] };
export const Multiplicity = z.string().max(60).refine(v=>v==='' || /^(?:\*|\d+(?:\.\.(?:\d+|\*))?)(?:\s*,\s*(?:\*|\d+(?:\.\.(?:\d+|\*))?))*$/.test(v) && v.split(',').every(s=>!s.includes('..') || s.trim().split('..')[1]==='*' || Number(s.trim().split('..')[0])<=Number(s.trim().split('..')[1])), 'Invalid UML multiplicity');
export const Connection = z.object({ id:Id,source:Id,target:Id,kind:Relationship,name:Text,sourceRole:Text,targetRole:Text,sourceMultiplicity:Multiplicity,targetMultiplicity:Multiplicity,navigability:z.enum(['none','source','target','both']),protocol:Text,asynchronous:z.boolean(),order:z.number().int().nonnegative().default(0),guard:Text.default(''),event:Text.default(''),branch:Text.default(''),fragmentId:Id.nullable().default(null),replyTo:Id.nullable().default(null) }).strict();
export const Explanation = z.object({ functionalRequirements:z.array(Text).max(40),nonfunctionalRequirements:z.array(Text).max(40),assumptions:z.array(Text).max(40),responsibilities:z.array(Text).max(100),dataFlows:z.array(Text).max(100),scalability:z.array(Text).max(40),bottlenecks:z.array(Text).max(40),tradeoffs:z.array(Text).max(40),improvements:z.array(Text).max(40),patterns:z.array(Text).max(40),warnings:z.array(Text).max(40) }).strict();
export const GraphBase = z.object({ schemaVersion:z.literal(1),diagramType:DiagramType,components:z.array(Component).max(200),connections:z.array(Connection).max(500),explanation:Explanation }).strict();
export const Graph = GraphBase.superRefine((g,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:'custom',message});
  const ids=new Set<string>(),nodes=new Map(g.components.map(c=>[c.id,c]));
  for(const c of g.components){
    for(const id of [c.id,...c.attributes.map(a=>a.id),...c.methods.map(m=>m.id)]){if(ids.has(id))fail(`Duplicate ID: ${id}`);ids.add(id);}
    if(!kindsByType[g.diagramType].includes(c.kind))fail(`${c.kind} is not supported in ${g.diagramType}`);
    if(!isUml(c.kind)&&(c.attributes.length||c.methods.length))fail(`Non-class component ${c.id} cannot have class members`);
    const parent=c.parentId?nodes.get(c.parentId):undefined;
    if(c.parentId && (!parent || !isContainer(parent.kind) && !(c.kind==='activation' && ['participant','actor'].includes(parent.kind))))fail(`Invalid container: ${c.id}`);
    let p=c.parentId;const seen=new Set([c.id]);while(p){if(seen.has(p)){fail('Container cycle');break;}seen.add(p);p=nodes.get(p)?.parentId??null;}
    if(['activation','fragment'].includes(c.kind) && (c.startOrder<1 || c.endOrder<c.startOrder))fail(`Invalid sequence range: ${c.id}`);
    if(c.kind==='activation' && !c.parentId)fail('Activation must belong to a participant');
    if(c.kind==='fragment' && !['loop','alt','opt'].includes(c.stereotype))fail('Sequence fragments must use loop, alt or opt');
  }
  const orders=new Set<number>();
  for(const e of g.connections){
    if(ids.has(e.id))fail(`Duplicate ID: ${e.id}`);ids.add(e.id);
    const s=nodes.get(e.source),t=nodes.get(e.target);if(!s||!t){fail(`Dangling relationship: ${e.id}`);continue;}
    if(!relationsByType[g.diagramType].includes(e.kind))fail(`${e.kind} is not supported in ${g.diagramType}`);
    if(e.kind==='realization'&&!['interface','provided_interface'].includes(t.kind))fail('Realization target must be an interface');
    if(g.diagramType==='uml_class' && e.kind==='generalization' && (s.kind==='enum'||t.kind==='enum'||(s.kind==='interface')!==(t.kind==='interface')))fail('Invalid generalization types');
    if(['generalization','realization','composition','aggregation','include','extend'].includes(e.kind)&&s.id===t.id)fail('Invalid self relationship');
    if(['generalization','realization'].includes(e.kind)&&(e.sourceMultiplicity||e.targetMultiplicity))fail('Inheritance cannot have multiplicities');
    if(g.diagramType==='sequence'){
      if(!['actor','participant'].includes(s.kind)||!['actor','participant'].includes(t.kind))fail('Messages must connect participants');
      if(e.order<1||orders.has(e.order))fail('Message order must be positive and unique');orders.add(e.order);
      if(e.fragmentId){const f=nodes.get(e.fragmentId);if(f?.kind!=='fragment'||e.order<f.startOrder||e.order>f.endOrder)fail('Message lies outside its fragment');}
      if(e.kind==='return_message'){const call=g.connections.find(c=>c.id===e.replyTo);if(!call||call.kind==='return_message'||call.order>=e.order||call.source!==e.target||call.target!==e.source)fail('Return must refer to an earlier reverse-direction call');}
    }
    if(['include','extend'].includes(e.kind)&&(s.kind!=='use_case'||t.kind!=='use_case'))fail('Include/extend must connect use cases');
    if(g.diagramType==='use_case' && e.kind==='generalization' && (s.kind!==t.kind||!['actor','use_case'].includes(s.kind)))fail('Use case generalization must connect matching kinds');
    if(e.kind==='deployment'&&(s.kind!=='artifact'||!['device','execution_environment'].includes(t.kind)))fail('Deployment points from artifact to execution node');
    if(e.kind==='communication'&&(!['device','execution_environment'].includes(s.kind)||!['device','execution_environment'].includes(t.kind)))fail('Communication connects deployment nodes');
    if(g.diagramType==='activity' && (['swimlane','end'].includes(s.kind)||['swimlane','start'].includes(t.kind)))fail('Invalid activity control flow');
    if(g.diagramType==='state_machine' && (s.kind==='final_state'||t.kind==='initial_state'))fail('Invalid state transition');
  }
  for(const kind of ['generalization','composition']){
    const visiting=new Set<string>(),done=new Set<string>();const visit=(id:string):boolean=>{if(visiting.has(id))return true;if(done.has(id))return false;visiting.add(id);for(const e of g.connections.filter(e=>e.kind===kind&&e.source===id))if(visit(e.target))return true;visiting.delete(id);done.add(id);return false;};if(g.components.some(c=>visit(c.id)))fail(`${kind} cycle`);
  }
});
export type DiagramGraph=z.infer<typeof Graph>;
export type DiagramComponent=z.infer<typeof Component>;
export type DiagramConnection=z.infer<typeof Connection>;
export type UmlAttribute=z.infer<typeof Attribute>;
export type UmlMethod=z.infer<typeof Method>;
export const emptyExplanation=():z.infer<typeof Explanation>=>({functionalRequirements:[],nonfunctionalRequirements:[],assumptions:[],responsibilities:[],dataFlows:[],scalability:[],bottlenecks:[],tradeoffs:[],improvements:[],patterns:[],warnings:[]});
export const emptyGraph=(diagramType:DiagramTypeName='hld'):DiagramGraph=>({schemaVersion:1,diagramType,components:[],connections:[],explanation:emptyExplanation()});
export const newComponent=(id:string,kind:DiagramComponent['kind'],name:string):DiagramComponent=>Component.parse({id,kind,name,description:'',stereotype:kind==='fragment'?'opt':'',attributes:[],methods:[],parentId:null});
export const newConnection=(id:string,source:string,target:string,kind:DiagramConnection['kind']):DiagramConnection=>Connection.parse({id,source,target,kind,name:'',sourceRole:'',targetRole:'',sourceMultiplicity:'',targetMultiplicity:'',navigability:'none',protocol:'',asynchronous:false});
export function migrateGraph(value:unknown):DiagramGraph { const raw=structuredClone(value) as Record<string,unknown>;if(raw['diagramType']==='whiteboard')raw['diagramType']='hld';return Graph.parse(raw); }
