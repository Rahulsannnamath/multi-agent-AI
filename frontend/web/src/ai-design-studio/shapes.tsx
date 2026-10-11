import { useDiagramView, type DetailLevel } from './viewing';
import {
  BaseBoxShapeUtil,
  ShapeUtil,
  BindingUtil,
  SVGContainer,
  Rectangle2d,
  Group2d,
  Polyline2d,
  getIndices,
  Vec,
  T,
  createBindingId,
  resizeBox,
  type TLResizeInfo,
  type TLBaseShape,
  type TLBaseBinding,
  type TLHandle,
  type TLHandleDragInfo,
  type BindingOnShapeChangeOptions,
  type BindingOnShapeDeleteOptions,
} from 'tldraw';
import {
  labelLines,attributeLabel,
  measureComponent,
  methodLabel,
  isUml,
  isContainer,
  connectionLabel,
  type DiagramComponent,
  type DiagramConnection,
  type DiagramTypeName,
  type EdgeRoute,
  type PlacedNode,
  type Point,
} from '@multi-agent/ai-design-studio';
export function NodeArtwork({
  component,
  visual,
  diagramType,
  level = 'detail',
}: {
  component: DiagramComponent;
  visual: PlacedNode & { color?: string };
  diagramType: DiagramTypeName;
  level?: DetailLevel;
}) {
  const c = component,
    { w, h } = visual,
    color = visual.color ?? '#6366f1',
    uml = isUml(c.kind),
    sequence = diagramType === 'sequence';
  const nameLines = labelLines(c.name, Math.max(8, Math.floor((w-36)/7.5)));
  const header = Math.max(62, 44 + nameLines.length * 18);
  const wrappedName = (x:number,available=w-32) => labelLines(c.name,Math.max(8,Math.floor(available/7.5))).map((line,i)=><tspan key={i} x={x} dy={i ? 18 : 0}>{line}</tspan>);
  const frame = { fill: 'white', stroke: color, strokeWidth: 2 };
  const title = (
    <text
      x={w / 2}
      y={30}
      textAnchor="middle"
      fontWeight="bold"
      fontStyle={c.kind === 'abstract' ? 'italic' : undefined}
    >
      {nameLines.map((line,i) => <tspan key={i} x={w/2} dy={i ? 18 : 0}>{line}</tspan>)}
    </text>
  );
  if (['database','nosql','storage'].includes(c.kind)) return <g><path d={`M2 18V${h-18}A${w/2-2} 16 0 0 0 ${w-2} ${h-18}V18`} {...frame}/><ellipse cx={w/2} cy={18} rx={w/2-2} ry={16} {...frame}/><text x={w/2} y={55} textAnchor="middle" fontWeight="bold">{wrappedName(w/2)}</text><text x={w/2} y={Math.max(76,55+nameLines.length*18)} textAnchor="middle" fontSize={12}>{c.kind.toUpperCase()}</text></g>;
  if (['provided_interface', 'required_interface'].includes(c.kind))
    return (
      <g>
        {c.kind === 'provided_interface' ? (
          <circle cx={w / 2} cy={24} r={14} {...frame} />
        ) : (
          <path
            d={`M${w / 2 + 14} 10A14 14 0 0 0 ${w / 2 + 14} 38`}
            fill="none"
            stroke={color}
            strokeWidth={2}
          />
        )}
        <text x={w / 2} y={60} textAnchor="middle">
          {wrappedName(w/2)}
        </text>
        <text x={w / 2} y={60+nameLines.length*18} textAnchor="middle" fontSize={12}>
          {c.kind === 'provided_interface' ? 'provided' : 'required'}
        </text>
      </g>
    );
  if (['start', 'initial_state', 'end', 'final_state'].includes(c.kind))
    return (
      <g>
        <circle
          cx={w / 2}
          cy={h / 2}
          r={Math.min(w, h) / 2 - 2}
          fill={['start', 'initial_state'].includes(c.kind) ? color : 'white'}
          stroke={color}
          strokeWidth={2}
        />
        {['end', 'final_state'].includes(c.kind) && (
          <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2 - 8} fill={color} />
        )}
      </g>
    );
  if (['decision', 'merge'].includes(c.kind))
    return (
      <g>
        <path d={`M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`} {...frame} />
        <text x={w / 2} y={h / 2 + 4 - (nameLines.length-1)*9} textAnchor="middle">
          {wrappedName(w/2)}
        </text>
      </g>
    );
  if (['fork', 'join'].includes(c.kind)) return <rect width={w} height={h} fill={color} />;
  if (c.kind === 'activation') return <rect width={w} height={h} {...frame} />;
  if (c.kind === 'actor')
    return (
      <g>
        <circle cx={w / 2} cy={16} r={13} {...frame} />
        <path
          d={`M${w / 2} 29V62M${w / 2 - 25} 43H${w / 2 + 25}M${w / 2} 62L${w / 2 - 23} 86M${w / 2} 62L${w / 2 + 23} 86`}
          fill="none"
          stroke={color}
          strokeWidth={2}
        />
        <text x={w / 2} y={108} textAnchor="middle">
          {wrappedName(w/2)}
        </text>
        {sequence && <path d={`M${w / 2} ${Math.max(120,116+nameLines.length*18)}V${h}`} stroke={color} strokeDasharray="7 5" />}
      </g>
    );
  if (c.kind === 'participant')
    return (
      <g>
        <rect width={w} height={header} {...frame} />
        {title}
        <path d={`M${w / 2} ${header}V${h}`} stroke={color} strokeDasharray="7 5" />
      </g>
    );
  if (c.kind === 'use_case')
    return (
      <g>
        <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 2} ry={h / 2 - 2} {...frame} />
        <text x={w / 2} y={h / 2 + 5 - (nameLines.length-1)*9} textAnchor="middle">
          {wrappedName(w/2)}
        </text>
      </g>
    );
  if (c.kind === 'fragment')
    return (
      <g>
        <rect width={w} height={h} fill="none" stroke={color} />
        <path d="M0 32H88L100 20V0" fill="white" stroke={color} />
        <text x={8} y={22}>
          {c.stereotype || 'opt'}
        </text>
        <text x={115} y={23}>
          [{c.condition || c.name}]
        </text>
        {visual.dividers?.map((d, i) => (
          <g key={i}>
            {i > 0 && <path d={`M0 ${d.y}H${w}`} stroke={color} strokeDasharray="5 4" />}
            <text x={10} y={d.y + 20}>
              [{d.label}]
            </text>
          </g>
        ))}
      </g>
    );
  if (c.kind === 'composite_state')
    return (
      <g>
        <rect width={w} height={h} rx={16} fill="#eef2ff18" stroke={color} strokeWidth={2} />
        {title}
        <path d={`M0 50H${w}`} stroke={color} />
      </g>
    );
  if (isContainer(c.kind))
    return (
      <g>
        {['device', 'execution_environment'].includes(c.kind) && (
          <path
            d={`M0 12L12 0H${w - 12}L${w} 12V${h - 12}L${w - 12} ${h}M${w - 12} 0V${h}M${w - 12} 0L${w} 12`}
            fill="#eef2ff"
            stroke={color}
          />
        )}
        <rect
          x={0}
          y={12}
          width={w - (['device', 'execution_environment'].includes(c.kind) ? 12 : 0)}
          height={h - 12}
          fill="#eef2ff18"
          stroke={color}
          strokeWidth={2}
          strokeDasharray={c.kind === 'boundary' && diagramType !== 'use_case' ? '7 5' : undefined}
        />
        <text x={12} y={36} fontWeight="bold">
          {['device', 'execution_environment'].includes(c.kind)
            ? `«${c.kind === 'execution_environment' ? 'executionEnvironment' : c.kind}» `
            : ''}
          {wrappedName(w/2)}
        </text>
        {c.kind === 'swimlane' && <path d={`M0 56H${w}`} stroke={color} />}
      </g>
    );
  const top = header;
  const limit = Math.max(8, Math.floor((w-24)/7.5));
  const attributes = c.attributes.map(a => ({ member: a, lines: labelLines(attributeLabel(a), limit) }));
  const methods = c.methods.map(m => ({ member: m, lines: labelLines(methodLabel(m), limit) }));
  const middle = top + Math.max(1, attributes.reduce((sum,a) => sum+a.lines.length,0))*20;
  let attributeY = top + 16, methodY = middle + 16;
  return (
    <g>
      <rect width={w} height={h} rx={['action', 'state'].includes(c.kind) ? 16 : 3} {...frame} />
      {c.kind === 'artifact' && (
        <path
          d={`M${w - 24} 8H${w - 8}V28H${w - 24}Z M${w - 15} 8V16H${w - 8}`}
          fill="none"
          stroke={color}
        />
      )}
      {c.kind === 'component' && (
        <g fill="white" stroke={color}>
          <rect x={w - 30} y={9} width={20} height={27} />
          <rect x={w - 36} y={13} width={12} height={7} />
          <rect x={w - 36} y={25} width={12} height={7} />
        </g>
      )}
      {title}
      {(c.stereotype || ['interface', 'enum', 'artifact'].includes(c.kind)) && (
        <text x={w / 2} y={14} textAnchor="middle" fontSize={12}>
          «{c.stereotype || (c.kind === 'enum' ? 'enumeration' : c.kind)}»
        </text>
      )}
      {uml ? (
        <>
          {level !== 'overview' && <path d={`M0 ${top}H${w}M0 ${middle}H${w}`} stroke={color} />}
          {level !== 'overview' && attributes.slice(0, level === 'medium' ? 3 : undefined).map(({member:a,lines}) => {
            const y = attributeY; attributeY += lines.length*20;
            return <text key={a.id} x={12} y={y} textDecoration={a.isStatic ? 'underline' : undefined} fontStyle={a.isAbstract ? 'italic' : undefined}>
              {lines.map((line,i) => <tspan key={i} x={12} dy={i ? 20 : 0}>{line}</tspan>)}
            </text>;
          })}
          {level === 'detail' && methods.map(({member:m,lines}) => {
            const y = methodY; methodY += lines.length*20;
            return <text key={m.id} x={12} y={y} textDecoration={m.isStatic ? 'underline' : undefined} fontStyle={m.isAbstract ? 'italic' : undefined}>
              {lines.map((line,i) => <tspan key={i} x={12} dy={i ? 20 : 0}>{line}</tspan>)}
            </text>;
          })}
        </>
      ) : (
        <>
          <text x={w / 2} y={header-13} textAnchor="middle" fontSize={12}>
            {c.kind.replaceAll('_', ' ').toUpperCase()}
          </text>
          {(level !== 'overview' || c.condition) && labelLines(c.description || c.condition, limit)
            .slice(0, level === 'medium' ? 2 : Math.max(0, Math.floor((h-header)/18)))
            .map((line,i) => <text x={12} y={header+14+i*18} key={i} fontSize={13}>{line}</text>)}
        </>
      )}
    </g>
  );
}
function marker(p: Point, previous: Point, kind: string, color: string, key: string) {
  const angle = (Math.atan2(p.y - previous.y, p.x - previous.x) * 180) / Math.PI;
  return (
    <g
      key={key}
      transform={`translate(${p.x} ${p.y}) rotate(${angle})`}
      stroke={color}
      strokeWidth={2}
    >
      {kind === 'triangle' ? (
        <path d="M0 0L-17 -9L-17 9Z" fill="white" />
      ) : kind === 'filled' ? (
        <path d="M0 0L-13 -7L-13 7Z" fill={color} />
      ) : kind.includes('diamond') ? (
        <path d="M0 0L-12 -7L-24 0L-12 7Z" fill={kind === 'diamond-filled' ? color : 'white'} />
      ) : (
        <path d="M-12 -7L0 0L-12 7" fill="none" />
      )}
    </g>
  );
}
export function wireMarkers(e: DiagramConnection) {
  return {
    start: ['composition', 'aggregation'].includes(e.kind)
      ? e.kind === 'composition'
        ? 'diamond-filled'
        : 'diamond'
      : ['source', 'both'].includes(e.navigability)
        ? 'open'
        : '',
    end: ['generalization', 'realization'].includes(e.kind)
      ? 'triangle'
      : e.kind === 'sync_message'
        ? 'filled'
        : [
              'dependency',
              'flow',
              'async_message',
              'return_message',
              'control_flow',
              'include',
              'extend',
              'transition',
              'deployment',
            ].includes(e.kind) || ['target', 'both'].includes(e.navigability)
          ? 'open'
          : '',
  };
}
export function EdgeArtwork({
  connection: e,
  route: r,
  color = '#475569',
  level = 'detail',
}: {
  connection: DiagramConnection;
  route: EdgeRoute;
  level?: DetailLevel;
  color?: string;
}) {
  const p = r.points,
    { start, end } = wireMarkers(e);
  const labels = [
    [connectionLabel(level === 'detail' || e.kind !== 'flow' ? e : { ...e, protocol: '' }), r.label],
    [`${e.sourceMultiplicity} ${e.sourceRole}`.trim(), r.sourceLabel],
    [`${e.targetMultiplicity} ${e.targetRole}`.trim(), r.targetLabel],
  ] as const;
  return (
    <g>
      <polyline
        points={p.map((v) => `${v.x},${v.y}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray={
          [
            'dependency',
            'realization',
            'return_message',
            'include',
            'extend',
            'deployment',
          ].includes(e.kind) || e.asynchronous
            ? '7 5'
            : undefined
        }
      />
      {start && marker(p[0], p[1], start, color, 's')}
      {end && marker(p[p.length - 1], p[p.length - 2], end, color, 't')}
      {labels.map(
        ([text, b], i) =>
          text && (
            <g key={i}>
              <rect {...{ x: b.x, y: b.y, width: b.w, height: b.h }} fill="white" rx={3} />
              <text
                x={b.x + b.w / 2}
                y={b.y + 15}
                textAnchor="middle"
                fontFamily="Arial"
                fontSize={12}
                fill="#172033"
              >
                {labelLines(text).map((line,row)=><tspan key={row} x={b.x+b.w/2} dy={row?16:0}>{line}</tspan>)}
              </text>
            </g>
          )
      )}
    </g>
  );
}

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'studio-component': {
      w: number;
      h: number;
      data: string;
      diagramType: string;
      color: string;
      dividers: string;
    };
    'studio-connector': { w: number; h: number; data: string; route: string };
  }
  interface TLGlobalBindingPropsMap {
    'studio-wire': { terminal: string; anchorX: number; anchorY: number };
  }
}
export type ComponentShape = TLBaseShape<
  'studio-component',
  { w: number; h: number; data: string; diagramType: string; color: string; dividers: string }
>;
export type ConnectorShape = TLBaseShape<
  'studio-connector',
  { w: number; h: number; data: string; route: string }
>;
export type ConnectorBinding = TLBaseBinding<
  'studio-wire',
  { terminal: string; anchorX: number; anchorY: number }
>;
export class StudioComponentUtil extends BaseBoxShapeUtil<ComponentShape> {
  static override type = 'studio-component' as const;
  static override props = {
    w: T.number,
    h: T.number,
    data: T.string,
    diagramType: T.string,
    color: T.string,
    dividers: T.string,
  };
  override getDefaultProps() {
    return { w: 250, h: 140, data: '{}', diagramType: 'hld', color: '#6366f1', dividers: '[]' };
  }
  override getGeometry(shape: ComponentShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }
  override onResize(shape: ComponentShape, info: TLResizeInfo<ComponentShape>) {
    const size = measureComponent(JSON.parse(shape.props.data));
    return resizeBox(shape, info, { minWidth: size.w, minHeight: size.h });
  }
  artwork(shape: ComponentShape, level: DetailLevel = 'detail') {
    return (
      <g fontFamily="Arial" fontSize={14} fill="#172033">
        <NodeArtwork
          level={level}
          component={JSON.parse(shape.props.data)}
          visual={{
            id: shape.id,
            x: 0,
            y: 0,
            w: shape.props.w,
            h: shape.props.h,
            color: shape.props.color,
            dividers: JSON.parse(shape.props.dividers),
          }}
          diagramType={shape.props.diagramType as DiagramTypeName}
        />
      </g>
    );
  }
  override component(shape: ComponentShape) {
    return <LiveNode shape={shape} util={this} />;
  }
  override getIndicatorPath(shape: ComponentShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
  override toSvg(shape: ComponentShape) {
    return this.artwork(shape);
  }
}
export class StudioConnectorUtil extends ShapeUtil<ConnectorShape> {
  static override type = 'studio-connector' as const;
  static override props = { w: T.number, h: T.number, data: T.string, route: T.string };
  override getDefaultProps() {
    return { w: 1, h: 1, data: '{}', route: '{}' };
  }
  override canResize() {
    return false;
  }
  override canBind() {
    return true;
  }
  override getGeometry(shape: ConnectorShape) {
    const r = JSON.parse(shape.props.route) as EdgeRoute;
    return new Group2d({
      children: [
        new Polyline2d({ points: r.points.map((p) => new Vec(p.x, p.y)) }),
        ...[r.label, r.sourceLabel, r.targetLabel].map(
          (b) => new Rectangle2d({ x: b.x, y: b.y, width: b.w, height: b.h, isFilled: false })
        ),
      ],
    });
  }
  override component(shape: ConnectorShape) {
    return <LiveEdge shape={shape} />;
  }
  override getIndicatorPath(shape: ConnectorShape) {
    const r = JSON.parse(shape.props.route) as EdgeRoute,
      path = new Path2D();
    r.points.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
    return path;
  }
  override toSvg(shape: ConnectorShape) {
    return (
      <EdgeArtwork
        connection={JSON.parse(shape.props.data)}
        route={JSON.parse(shape.props.route)}
      />
    );
  }
  override getHandles(shape: ConnectorShape): TLHandle[] {
    return (JSON.parse(shape.props.route) as EdgeRoute).points.map((p, i) => ({
      id: String(i),
      type: 'vertex',
      index: getIndices((JSON.parse(shape.props.route) as EdgeRoute).points.length)[i],
      x: p.x,
      y: p.y,
    }));
  }
  override onHandleDrag(shape: ConnectorShape, info: TLHandleDragInfo<ConnectorShape>) {
    const route = JSON.parse(shape.props.route) as EdgeRoute,
      edge = JSON.parse(shape.props.data) as DiagramConnection,
      index = Number(info.handle.id);
    route.points[index] = { x: info.handle.x, y: info.handle.y };
    if (index === 0 || index === route.points.length - 1) {
      const terminal = index === 0 ? 'source' : 'target',
        page = this.editor.getShapePageTransform(shape).applyToPoint(info.handle);
      const target = this.editor
        .getCurrentPageShapes()
        .filter((s) => s.type === 'studio-component')
        .find((s) => this.editor.getShapePageBounds(s)?.containsPoint(page));
      if (target) {
        const component = JSON.parse((target as ComponentShape).props.data) as DiagramComponent;
        edge[terminal] = component.id;
        const bounds = this.editor.getShapePageBounds(target)!;
        const old = this.editor
          .getBindingsFromShape<ConnectorBinding>(shape, 'studio-wire')
          .filter((b) => b.props.terminal === terminal);
        this.editor.deleteBindings(old.map((b) => b.id));
        this.editor.createBinding({
          id: createBindingId(),
          type: 'studio-wire',
          fromId: shape.id,
          toId: target.id,
          props: {
            terminal,
            anchorX: (page.x - bounds.x) / bounds.w,
            anchorY: (page.y - bounds.y) / bounds.h,
          },
        });
      }
    }
    return {
      id: shape.id,
      type: shape.type,
      props: { route: JSON.stringify({ ...route, manual: true }), data: JSON.stringify(edge) },
    };
  }
}
export class StudioLinkUtil extends BindingUtil<ConnectorBinding> {
  static override type = 'studio-wire' as const;
  static override props = { terminal: T.string, anchorX: T.number, anchorY: T.number };
  override getDefaultProps() {
    return { terminal: 'source', anchorX: 1, anchorY: 0.5 };
  }
  override onAfterChangeToShape({ binding }: BindingOnShapeChangeOptions<ConnectorBinding>) {
    const edge = this.editor.getShape<ConnectorShape>(binding.fromId),
      target = this.editor.getShape(binding.toId);
    if (!edge || !target) return;
    if (edge.type !== 'studio-connector') {
      if (edge.type === 'studio-component' && JSON.parse(edge.props.data).kind === 'activation') {
        const b = this.editor.getShapePageBounds(target);
        if (b)
          this.editor.updateShape({
            id: edge.id,
            type: 'studio-component',
            x: b.center.x - (edge as unknown as ComponentShape).props.w / 2,
          });
      }
      return;
    }
    const bounds = this.editor.getShapePageBounds(target);
    if (!bounds) return;
    const route = JSON.parse(edge.props.route) as EdgeRoute,
      index = binding.props.terminal === 'source' ? 0 : route.points.length - 1;
    const point = this.editor
      .getShapePageTransform(edge)
      .clone()
      .invert()
      .applyToPoint({
        x: bounds.x + bounds.w * binding.props.anchorX,
        y: bounds.y + bounds.h * binding.props.anchorY,
      });
    if (route.points[index].x === point.x && route.points[index].y === point.y) return;
    const old = route.points[index],
      dx = point.x - old.x,
      dy = point.y - old.y;
    route.points[index] = { x: point.x, y: point.y };
    const terminalLabel = index === 0 ? route.sourceLabel : route.targetLabel;
    terminalLabel.x += dx;
    terminalLabel.y += dy;
    route.label.x += dx / 2;
    route.label.y += dy / 2;
    const adjacent = index === 0 ? 1 : index - 1;
    if (route.points[adjacent]) {
      if (route.points[adjacent].x === old.x) route.points[adjacent].x += dx;
      if (route.points[adjacent].y === old.y) route.points[adjacent].y += dy;
    }
    this.editor.updateShape({
      id: edge.id,
      type: edge.type,
      props: { route: JSON.stringify(route) },
    });
  }
  override onBeforeDeleteToShape({ binding }: BindingOnShapeDeleteOptions<ConnectorBinding>) {
    this.editor.deleteShape(binding.fromId);
  }
}
export const studioShapeUtils = [StudioComponentUtil, StudioConnectorUtil];
export const studioBindingUtils = [StudioLinkUtil];

function LiveNode({shape,util}: {shape:ComponentShape;util:StudioComponentUtil}) {
  const view = useDiagramView(shape.id);
  return <SVGContainer><g data-testid="studio-component" data-detail={view.level} opacity={view.dim ? .2 : 1}><title>{JSON.parse(shape.props.data).name}</title>{util.artwork(shape, view.level)}</g></SVGContainer>;
}
function LiveEdge({shape}: {shape:ConnectorShape}) {
  const view = useDiagramView(shape.id);
  // Relationship notation, guards, message ordering and cardinalities remain visible at every zoom.
  return <SVGContainer><g opacity={view.dim ? .15 : 1}><EdgeArtwork level={view.level} connection={JSON.parse(shape.props.data)} route={JSON.parse(shape.props.route)} /></g></SVGContainer>;
}
