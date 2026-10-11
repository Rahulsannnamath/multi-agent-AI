import ELK from 'elkjs/lib/elk.bundled.js';
import { attributeLabel,methodLabel } from './export.js';
import { isUml,type DiagramComponent,type DiagramConnection,type DiagramGraph } from './schema.js';

export interface Point { x:number; y:number }
export interface Box extends Point { w:number; h:number }
export interface PlacedNode extends Box { id:string; dividers?:{y:number;label:string}[] }
export interface EdgeRoute { id:string;points:Point[];label:Box;sourceLabel:Box;targetLabel:Box }
export interface LayoutResult { nodes:PlacedNode[];edges:EdgeRoute[];warnings:string[] }
export function measureComponent(c:DiagramComponent):Pick<Box,'w'|'h'>{
  const titleWidth=Math.min(360,c.name.length*7.5+36);
  const width=isUml(c.kind)?Math.max(220,Math.min(336,Math.max(titleWidth,...c.attributes.map(a=>attributeLabel(a).length*7.5+24),...c.methods.map(m=>methodLabel(m).length*7.5+24)))):titleWidth;
  const header=Math.max(62,44+labelLines(c.name,Math.max(8,Math.floor((width-36)/7.5))).length*18);
  const memberLines=(text:string)=>labelLines(text,Math.max(8,Math.floor((width-24)/7.5))).length;
  if(isUml(c.kind))return {w:width,h:header+Math.max(1,c.attributes.reduce((n,a)=>n+memberLines(attributeLabel(a)),0))*20+Math.max(1,c.methods.reduce((n,m)=>n+memberLines(methodLabel(m)),0))*20};
  if(['start','end','initial_state','final_state'].includes(c.kind))return {w:34,h:34};
  if(['decision','merge'].includes(c.kind))return {w:Math.max(110,width+30),h:100};
  if(['fork','join'].includes(c.kind))return {w:180,h:12};
  if(c.kind==='actor')return {w:Math.max(120,width),h:Math.max(120,118+labelLines(c.name,Math.max(8,Math.floor((Math.max(120,width)-32)/7.5))).length*18)};
  if(c.kind==='activation')return {w:14,h:100};
  if(c.kind==='participant')return {w:Math.max(170,width),h:500};
  if(['provided_interface','required_interface'].includes(c.kind))return {w:Math.max(140,width),h:Math.max(90,78+labelLines(c.name,Math.max(8,Math.floor((Math.max(140,width)-32)/7.5))).length*18)};
  if(c.kind==='use_case')return {w:Math.max(190,width+30),h:90};
  return {w:Math.max(210,width),h:Math.max(['device','execution_environment','artifact'].includes(c.kind)?130:100,header+8+labelLines(c.description||c.condition,Math.floor((Math.max(210,width)-24)/7.5)).length*18)};
}
const overlap=(a:Box,b:Box,pad=0)=>a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y;
const inside=(p:Point,b:Box)=>p.x>b.x&&p.x<b.x+b.w&&p.y>b.y&&p.y<b.y+b.h;
export function segmentHitsBox(a:Point,b:Point,box:Box){if(a.x===b.x)return a.x>box.x&&a.x<box.x+box.w&&Math.max(a.y,b.y)>box.y&&Math.min(a.y,b.y)<box.y+box.h;if(a.y===b.y)return a.y>box.y&&a.y<box.y+box.h&&Math.max(a.x,b.x)>box.x&&Math.min(a.x,b.x)<box.x+box.w;return true;}
const expanded=(b:Box,p=16):Box=>({x:b.x-p,y:b.y-p,w:b.w+2*p,h:b.h+2*p});
const simplify=(points:Point[])=>points.filter((p,i)=>i===0||i===points.length-1||!((points[i-1].x===p.x&&p.x===points[i+1].x)||(points[i-1].y===p.y&&p.y===points[i+1].y)));

// A compressed orthogonal visibility grid, with A* costs for bends and occupied
// segments. Every candidate segment is checked against expanded obstacle boxes.
function orthogonalPath(start:Point,end:Point,obstacles:Box[],occupied:[Point,Point][]):Point[]{
  const all=[start,end,...obstacles.flatMap(b=>[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y+b.h}])];
  const xs=[...new Set([...all.map(p=>p.x),Math.min(...all.map(p=>p.x))-50,Math.max(...all.map(p=>p.x))+50])].sort((a,b)=>a-b);
  const ys=[...new Set([...all.map(p=>p.y),Math.min(...all.map(p=>p.y))-50,Math.max(...all.map(p=>p.y))+50])].sort((a,b)=>a-b);
  const startI=xs.indexOf(start.x),startJ=ys.indexOf(start.y),endI=xs.indexOf(end.x),endJ=ys.indexOf(end.y);
  type State={i:number;j:number;dir:number;g:number;f:number;key:string};
  const first:State={i:startI,j:startJ,dir:0,g:0,f:0,key:`${startI},${startJ},0`};const queue=[first],cost=new Map([[first.key,0]]),previous=new Map<string,string>(),states=new Map([[first.key,first]]);
  let final:State|undefined,iterations=0;
  while(queue.length&&iterations++<150000){queue.sort((a,b)=>b.f-a.f);const current=queue.pop()!;if(current.g!==cost.get(current.key))continue;if(current.i===endI&&current.j===endJ){final=current;break;}
    for(const [di,dj,dir] of [[-1,0,1],[1,0,1],[0,-1,2],[0,1,2]]){
      const i=current.i+di,j=current.j+dj;if(i<0||j<0||i>=xs.length||j>=ys.length)continue;const a={x:xs[current.i],y:ys[current.j]},b={x:xs[i],y:ys[j]};
      if(obstacles.some(box=>inside(b,box)||segmentHitsBox(a,b,box)))continue;
      let penalty=0;for(const [c,d] of occupied){if(a.x===b.x&&c.x===d.x&&a.x===c.x&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y)))penalty+=80;else if(a.y===b.y&&c.y===d.y&&a.y===c.y&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x)))penalty+=80;else if(a.x===b.x&&c.y===d.y&&a.x>Math.min(c.x,d.x)&&a.x<Math.max(c.x,d.x)&&c.y>Math.min(a.y,b.y)&&c.y<Math.max(a.y,b.y))penalty+=50;}
      const g=current.g+Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+(current.dir&&current.dir!==dir?28:0)+penalty,key=`${i},${j},${dir}`;
      if(g>=(cost.get(key)??Infinity))continue;const state={i,j,dir,g,f:g+Math.abs(b.x-end.x)+Math.abs(b.y-end.y),key};cost.set(key,g);previous.set(key,current.key);states.set(key,state);queue.push(state);
    }
  }
  if(!final)throw new Error('No obstacle-free connector route found. Move the blocking shapes or re-layout.');
  const points:Point[]=[];let key:string|undefined=final.key;while(key){const s=states.get(key)!;points.push({x:xs[s.i],y:ys[s.j]});key=previous.get(key);}return simplify(points.reverse());
}
export function connectionLabel(e:DiagramConnection){
  const stereotype=e.kind==='include'?'<<include>>':e.kind==='extend'?'<<extend>>':e.kind==='deployment'?'<<deploy>>':'';
  return [e.order&&e.kind.includes('message')?`${e.order}.`:'',stereotype,e.event,e.name,e.guard?`[${e.guard}]`:'',e.protocol,e.branch?`{${e.branch}}`:''].filter(Boolean).join(' ');
}
export function labelLines(text:string,limit=38):string[]{const lines:string[]=[];let rest=text;while(rest.length>limit){const at=rest.lastIndexOf(' ',limit),cut=at>limit/2?at:limit;lines.push(rest.slice(0,cut));rest=rest.slice(cut).trimStart();}if(rest)lines.push(rest);return lines;}
function placeLabel(text:string,points:Point[],obstacles:Box[],labels:Box[]):Box{
  const lines=labelLines(text),w=Math.max(1,...lines.map(l=>l.length*7+12)),h=text?lines.length*16+10:1;
  if(!text)return {x:points[0].x,y:points[0].y,w,h};
  const segments=points.slice(1).map((b,i)=>({a:points[i],b,length:Math.abs(b.x-points[i].x)+Math.abs(b.y-points[i].y)})).sort((a,b)=>b.length-a.length);
  for(const {a,b} of segments)for(const t of [.5,.25,.75])for(const offset of [-18,18,-42,42,-66,66]){
    const horizontal=a.y===b.y;const box={x:a.x+(b.x-a.x)*t-w/2+(horizontal?0:offset),y:a.y+(b.y-a.y)*t-h/2+(horizontal?offset:0),w,h};
    if(![...obstacles,...labels].some(b=>overlap(box,b,5))){labels.push(box);return box;}
  }
  // A leader label in free space is preferable to a hidden/overlapping label.
  const a=points[Math.floor(points.length/2)];for(let ring=1;ring<150;ring++)for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){const box={x:a.x+dx*ring*28-w/2,y:a.y+dy*ring*28,w,h};if(![...obstacles,...labels].some(b=>overlap(box,b,5))){labels.push(box);return box;}}
  throw new Error('Could not place a connector label without collisions');
}
export function routeConnections(graph:DiagramGraph,nodes:PlacedNode[]):{edges:EdgeRoute[];warnings:string[]}{
  const lookup=new Map(nodes.map(n=>[n.id,n])),labels:Box[]=[],occupied:[Point,Point][]=[],edges:EdgeRoute[]=[],warnings:string[]=[];
  const ancestors=(id:string)=>{const result=new Set<string>();let p=graph.components.find(c=>c.id===id)?.parentId;while(p){result.add(p);p=graph.components.find(c=>c.id===p)?.parentId;}return result;};
  const parallel=new Map<string,number>();
  for(const e of [...graph.connections].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id))){
    const anchor=(id:string)=>{const n=lookup.get(id);if(!n)return n;const c=graph.components.find(c=>c.id===id)!;return ['provided_interface','required_interface'].includes(c.kind)?{...n,x:n.x+n.w/2-14,y:n.y+10,w:28,h:28}:n;};const source=anchor(e.source)!,target=anchor(e.target)!;if(!source||!target)continue;
    let points:Point[];
    if(graph.diagramType==='sequence'){
      const x=source.x+source.w/2,tx=target.x+target.w/2,y=140+e.order*88;
      points=e.source===e.target?[{x,y},{x:x+70,y},{x:x+70,y:y+32},{x,y:y+32}]:[{x,y},{x:tx,y}];
    }else{
      const excluded=new Set([e.source,e.target,...ancestors(e.source),...ancestors(e.target)]);
      const obstacles=nodes.filter(n=>!excluded.has(n.id)).map(n=>expanded(n));
      const key=[e.source,e.target].sort().join('|'),index=parallel.get(key)??0;parallel.set(key,index+1);const shift=(index%2?1:-1)*Math.ceil(index/2)*16;
      const dx=target.x+target.w/2-(source.x+source.w/2),dy=target.y+target.h/2-(source.y+source.h/2);
      let s:Point,t:Point,sa:Point,ta:Point;
      if(e.source===e.target){s={x:source.x+source.w,y:source.y+source.h*.3};t={x:source.x+source.w*.7,y:source.y};sa={x:s.x+45+index*20,y:s.y};ta={x:t.x,y:t.y-45-index*20};}
      else if(Math.abs(dx)>Math.abs(dy)){const right=dx>=0;s={x:source.x+(right?source.w:0),y:source.y+source.h/2+Math.max(-source.h*.3,Math.min(source.h*.3,shift))};t={x:target.x+(right?0:target.w),y:target.y+target.h/2+Math.max(-target.h*.3,Math.min(target.h*.3,shift))};sa={x:s.x+(right?24:-24),y:s.y};ta={x:t.x+(right?-24:24),y:t.y};}
      else {const down=dy>=0;s={x:source.x+source.w/2+Math.max(-source.w*.3,Math.min(source.w*.3,shift)),y:source.y+(down?source.h:0)};t={x:target.x+target.w/2+Math.max(-target.w*.3,Math.min(target.w*.3,shift)),y:target.y+(down?0:target.h)};sa={x:s.x,y:s.y+(down?24:-24)};ta={x:t.x,y:t.y+(down?-24:24)};}
      // Include the endpoint boxes in the middle route to prevent looping through them.
      const middle=orthogonalPath(sa,ta,[...obstacles,...(ancestors(e.target).has(e.source)?[]:[expanded(source,8)]),...(e.source===e.target||ancestors(e.source).has(e.target)?[]:[expanded(target,8)])],occupied);
      points=simplify([s,...middle,t]);
    }
    for(let i=1;i<points.length;i++)occupied.push([points[i-1],points[i]]);
    const excluded=new Set([...ancestors(e.source),...ancestors(e.target)]);
    const obstacles=nodes.filter(n=>graph.diagramType==='sequence'?false:!excluded.has(n.id));
    const label=placeLabel(connectionLabel(e),points,obstacles,labels);
    const sourceLabel=placeLabel([e.sourceMultiplicity,e.sourceRole].filter(Boolean).join(' '),points.slice(0,2),obstacles,labels);
    const targetLabel=placeLabel([e.targetMultiplicity,e.targetRole].filter(Boolean).join(' '),points.slice(-2),obstacles,labels);
    edges.push({id:e.id,points,label,sourceLabel,targetLabel});
  }
  // Place labels after every route exists, so later edges cannot cross earlier labels.
  labels.length=0;
  const lineBoxes=edges.flatMap(r=>r.points.slice(1).map((p,i)=>({x:Math.min(p.x,r.points[i].x)-2,y:Math.min(p.y,r.points[i].y)-2,w:Math.max(1,Math.abs(p.x-r.points[i].x))+4,h:Math.max(1,Math.abs(p.y-r.points[i].y))+4})));
  for(const r of edges){const e=graph.connections.find(e=>e.id===r.id)!;const excluded=new Set([...ancestors(e.source),...ancestors(e.target)]);const nodeBoxes=graph.diagramType==='sequence'?nodes.flatMap(n=>{const c=graph.components.find(c=>c.id===n.id)!;return ['actor','participant'].includes(c.kind)?[{x:n.x,y:n.y,w:n.w,h:c.kind==='actor'?measureComponent(c).h:Math.max(62,44+labelLines(c.name,Math.max(8,Math.floor((n.w-36)/7.5))).length*18)},{x:n.x+n.w/2-2,y:n.y+62,w:4,h:n.h-62}]:c.kind==='activation'?[n]:[];}):nodes.filter(n=>!excluded.has(n.id));const obstacles=[...nodeBoxes,...lineBoxes];r.label=placeLabel(connectionLabel(e),r.points,obstacles,labels);r.sourceLabel=placeLabel([e.sourceMultiplicity,e.sourceRole].filter(Boolean).join(' '),r.points.slice(0,2),obstacles,labels);r.targetLabel=placeLabel([e.targetMultiplicity,e.targetRole].filter(Boolean).join(' '),r.points.slice(-2),obstacles,labels);}
  return {edges,warnings};
}
export function sequenceLayout(graph:DiagramGraph):PlacedNode[]{
  const participants=graph.components.filter(c=>['participant','actor'].includes(c.kind)).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  const height=240+Math.max(1,...graph.connections.map(e=>e.order))*88,nodes:PlacedNode[]=[];let x=70;
  for(const c of participants){const w=measureComponent(c).w;nodes.push({id:c.id,x,y:30,w,h:height});x+=w+90;}
  for(const c of graph.components.filter(c=>c.kind==='activation')){const parent=nodes.find(n=>n.id===c.parentId)!;nodes.push({id:c.id,x:parent.x+parent.w/2-7,y:140+c.startOrder*88,w:14,h:Math.max(36,(c.endOrder-c.startOrder)*88+32)});}
  for(const c of graph.components.filter(c=>c.kind==='fragment')){const messages=graph.connections.filter(e=>e.order>=c.startOrder&&e.order<=c.endOrder&&(!e.fragmentId||e.fragmentId===c.id));const involved=nodes.filter(n=>messages.some(e=>e.source===n.id||e.target===n.id));const left=Math.min(...(involved.length?involved:nodes.slice(0,participants.length)).map(n=>n.x))-25,right=Math.max(...(involved.length?involved:nodes.slice(0,participants.length)).map(n=>n.x+n.w))+100;const y=140+c.startOrder*88-45;const branches=[...new Set(messages.map(e=>e.branch).filter(Boolean))];const dividers=[...(branches.length?[{y:25,label:branches[0]}]:[]),...branches.slice(1).map(branch=>({y:140+Math.min(...messages.filter(e=>e.branch===branch).map(e=>e.order))*88-y-44,label:branch}))];nodes.push({id:c.id,x:left,y,w:right-left,h:(c.endOrder-c.startOrder)*88+100,dividers});}
  return nodes;
}
export async function layoutDiagram(graph:DiagramGraph,sizes:Record<string,Pick<Box,'w'|'h'>>={}):Promise<LayoutResult>{
  let nodes:PlacedNode[]=[];
  if(graph.diagramType==='sequence')nodes=sequenceLayout(graph);
  else {
    const direction=['hld','deployment','component'].includes(graph.diagramType)?'RIGHT':'DOWN';
    const build=(parent:string|null):import('elkjs').ElkNode[]=>graph.components.filter(c=>c.parentId===parent).map(c=>{const children=build(c.id),size=sizes[c.id]??measureComponent(c);return {id:c.id,...(children.length?{children,layoutOptions:{'elk.padding':'[top=64,left=32,bottom=32,right=32]','elk.direction':direction,'elk.spacing.nodeNode':'56','elk.layered.spacing.nodeNodeBetweenLayers':'88'}}:{width:size.w,height:size.h})};});
    const ElkConstructor=ELK as unknown as new()=>{layout:(input:unknown)=>Promise<import('elkjs/lib/elk-api.js').ElkNode>};const elk=new ElkConstructor();const result=await elk.layout({id:'root',layoutOptions:{'elk.algorithm':'layered','elk.direction':direction,'elk.hierarchyHandling':'INCLUDE_CHILDREN','elk.spacing.nodeNode':'56','elk.layered.spacing.nodeNodeBetweenLayers':'88','elk.spacing.edgeNode':'35','elk.spacing.edgeEdge':'30','elk.edgeRouting':'ORTHOGONAL','elk.layered.crossingMinimization.strategy':'LAYER_SWEEP'},children:build(null),edges:graph.connections.filter(e=>e.source!==e.target).map(e=>({id:e.id,sources:[graph.diagramType==='uml_class'&&['generalization','realization'].includes(e.kind)?e.target:e.source],targets:[graph.diagramType==='uml_class'&&['generalization','realization'].includes(e.kind)?e.source:e.target]}))});
    const collect=(n:import('elkjs').ElkNode,x=0,y=0)=>{const px=x+(n.x??0),py=y+(n.y??0);if(n.id!=='root')nodes.push({id:n.id,x:px,y:py,w:n.width??210,h:n.height??100});for(const child of n.children??[])collect(child,px,py);};collect(result);
  }
  const warnings=collisionWarnings(graph,nodes,[]);if(warnings.length)throw new Error(warnings.join('; '));
  let error:unknown;const measured=nodes;for(const factor of [1,1.6,2.5,4]){nodes=measured.map(n=>({...n,x:n.x*factor,y:n.y*factor,...(graph.components.some(c=>c.parentId===n.id)?{w:n.w*factor,h:n.h*factor}:{})}));try{const routes=routeConnections(graph,nodes);const collisions=collisionWarnings(graph,nodes,routes.edges);if(collisions.length)throw new Error(collisions.join('; '));return {nodes,...routes,warnings:[...routes.warnings,...(factor>1?['Spacing expanded automatically for readable connector routing.']:[])]};}catch(e){error=e;}}throw error;
}
export function collisionWarnings(graph:DiagramGraph,nodes:PlacedNode[],edges:EdgeRoute[]):string[]{
  const warnings:string[]=[];const ancestors=(id:string,target:string):boolean=>{let p=graph.components.find(c=>c.id===id)?.parentId;while(p){if(p===target)return true;p=graph.components.find(c=>c.id===p)?.parentId;}return false;};
  const decorative=(id:string)=>['activation','fragment'].includes(graph.components.find(c=>c.id===id)!.kind);
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)if(!decorative(nodes[i].id)&&!decorative(nodes[j].id)&&!ancestors(nodes[i].id,nodes[j].id)&&!ancestors(nodes[j].id,nodes[i].id)&&overlap(nodes[i],nodes[j]))warnings.push(`Node collision: ${nodes[i].id}/${nodes[j].id}`);
  if(graph.diagramType!=='sequence')for(const route of edges){const e=graph.connections.find(e=>e.id===route.id)!;for(const n of nodes)if(n.id!==e.source&&n.id!==e.target&&!ancestors(e.source,n.id)&&!ancestors(e.target,n.id)&&route.points.slice(1).some((p,i)=>segmentHitsBox(route.points[i],p,n)))warnings.push(`Connector collision: ${e.id}/${n.id}`);}
  return warnings;
}

