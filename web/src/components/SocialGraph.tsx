import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  group: number;   // 1=SAFE, 2=WARNING, 3=CRITICAL
  val: number;     // розмір вузла (залежить від OutDegree)
  burnout: number;
  outDegree: number;
  bottleneckScore: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
}

interface SocialGraphProps {
  nodes: Omit<GraphNode, 'index' | 'x' | 'y' | 'vx' | 'vy'>[];
  links: Omit<GraphLink, 'index'>[];
  busFactor?: number;
  topBottleneck?: string | null;
}

export default function SocialGraph({ nodes, links, busFactor, topBottleneck }: SocialGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    d3.select(svgRef.current).selectAll('*').remove();

    const width = svgRef.current.clientWidth || 800;
    const height = 460;

    // Глибоке копіювання, бо D3 мутує об'єкти
    const graphNodes: GraphNode[] = nodes.map((d) => ({ ...d }));
    const validNodeIds = new Set(graphNodes.map((d) => d.id));

    // Фільтруємо ребра де обидва вузли існують
    const graphLinks: GraphLink[] = links
      .filter(
        (d) =>
          validNodeIds.has(typeof d.source === 'string' ? d.source : (d.source as GraphNode).id) &&
          validNodeIds.has(typeof d.target === 'string' ? d.target : (d.target as GraphNode).id),
      )
      .map((d) => ({ ...d }));

    // ── Колір вузла залежить від рівня BI ─────────────────────────────────
    // SAFE (<0.3) → emerald, WARNING (0.3–0.6) → amber, CRITICAL (≥0.6) → red
    const nodeColor = (burnout: number): string => {
      if (burnout >= 0.6) return '#ef4444';  // red-500  (CRITICAL)
      if (burnout >= 0.3) return '#f59e0b';  // amber-500 (WARNING)
      return '#10b981';                       // emerald-500 (SAFE)
    };

    const svg = d3
      .select(svgRef.current)
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height].join(' '));

    const g = svg.append('g');

    // ── Zoom ──────────────────────────────────────────────────────────────
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 5])
        .on('zoom', (e) => g.attr('transform', e.transform)),
    );

    // ── Arrowhead marker (directed graph) ─────────────────────────────────
    // Визначаємо кілька маркерів: для кожного кольору стрілки
    const defs = svg.append('defs');

    const markerColors = [
      { id: 'arrow-safe', color: '#10b981' },
      { id: 'arrow-warning', color: '#f59e0b' },
      { id: 'arrow-critical', color: '#ef4444' },
      { id: 'arrow-default', color: '#6366f1' },
    ];

    markerColors.forEach(({ id, color }) => {
      defs
        .append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 22)  // відступ від центру вузла (радіус + зазор)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color)
        .attr('opacity', 0.8);
    });

    // ── Force Simulation ──────────────────────────────────────────────────
    const simulation = d3
      .forceSimulation(graphNodes)
      .force(
        'link',
        d3.forceLink(graphLinks).id((d: any) => d.id).distance(120),
      )
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force(
        'collide',
        d3.forceCollide().radius((d) => nodeRadius(d as GraphNode) + 8),
      );

    // ── Ребра (орієнтовані стрілки author → reviewer) ─────────────────────
    const link = g
      .append('g')
      .selectAll('line')
      .data(graphLinks)
      .join('line')
      .attr('stroke', '#6366f1')
      .attr('stroke-opacity', (d) => Math.min(0.25 + d.value * 0.12, 0.85))
      .attr('stroke-width', (d) => Math.max(1, Math.min(d.value * 0.8, 6)))
      .attr('marker-end', 'url(#arrow-default)');

    // ── Вузли ──────────────────────────────────────────────────────────────
    const nodeGroup = g
      .append('g')
      .selectAll('g')
      .data(graphNodes)
      .join('g')
      .style('cursor', 'grab')
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
            d3.select(event.sourceEvent.target.parentNode).style('cursor', 'grabbing');
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
            d3.select(event.sourceEvent.target.parentNode).style('cursor', 'grab');
          }),
      );

    // Зовнішнє кільце (glow ефект для bottleneck)
    nodeGroup
      .append('circle')
      .attr('r', (d) => nodeRadius(d) + 4)
      .attr('fill', 'none')
      .attr('stroke', (d) => nodeColor(d.burnout))
      .attr('stroke-width', (d) => (d.bottleneckScore > 0 ? 2 : 0))
      .attr('stroke-opacity', 0.4)
      .attr('stroke-dasharray', (d) => (d.bottleneckScore > 0 ? '4,2' : 'none'));

    // Основне коло вузла
    nodeGroup
      .append('circle')
      .attr('r', 0)
      .attr('fill', (d) => nodeColor(d.burnout))
      .attr('stroke', 'var(--bg-card)')
      .attr('stroke-width', 2)
      .transition()
      .duration(800)
      .delay((_, i) => i * 30)
      .attr('r', (d) => nodeRadius(d));

    // Підписи
    nodeGroup
      .append('text')
      .attr('dx', (d) => nodeRadius(d) + 6)
      .attr('dy', '.35em')
      .text((d) => d.name)
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', 'var(--text-main)')
      .style('pointer-events', 'none');

    // OutDegree label всередині великих вузлів
    nodeGroup
      .filter((d) => nodeRadius(d) >= 14)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '.35em')
      .text((d) => d.outDegree.toFixed(1))
      .attr('font-size', '9px')
      .attr('font-weight', 'bold')
      .attr('fill', 'white')
      .style('pointer-events', 'none');

    // Tooltip
    nodeGroup
      .append('title')
      .text(
        (d) =>
          `${d.name}\n` +
          `Burnout Index: ${(d.burnout * 100).toFixed(0)}%\n` +
          `OutDegree (reviews done): ${d.outDegree.toFixed(2)}\n` +
          `Bottleneck Score: ${d.bottleneckScore.toFixed(3)}`,
      );

    // ── Tick ──────────────────────────────────────────────────────────────
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x!)
        .attr('y1', (d) => (d.source as GraphNode).y!)
        .attr('x2', (d) => (d.target as GraphNode).x!)
        .attr('y2', (d) => (d.target as GraphNode).y!);

      nodeGroup.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [nodes, links]);

  return (
    <div className="w-full bg-[var(--bg-card)] rounded-md border border-[var(--border-color)] overflow-hidden relative">
      {nodes.length === 0 ? (
        <div className="h-[460px] flex items-center justify-center text-[var(--text-muted)]">
          Недостатньо даних Code Review для побудови соціального графа
        </div>
      ) : (
        <>
          <svg ref={svgRef} className="w-full" />

          {/* Legend */}
          <div className="absolute top-4 right-4 bg-[var(--bg-card)] border border-[var(--border-color)] p-3 rounded-md text-xs flex flex-col gap-1.5 shadow-sm">
            <div className="font-bold text-[var(--text-main)] mb-1 text-xs uppercase tracking-wide">Graph Legend</div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-[var(--text-muted)]">SAFE (BI &lt; 0.3)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-[var(--text-muted)]">WARNING (0.3–0.6)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-[var(--text-muted)]">CRITICAL (≥ 0.6)</span>
            </div>
            <div className="h-px bg-[var(--border-color)] my-1" />
            <div className="text-[var(--text-muted)] italic">Node size = OutDegree</div>
            <div className="text-[var(--text-muted)] italic">→ Arrow: Author → Reviewer</div>
            {topBottleneck && (
              <div className="mt-1 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-amber-500 font-medium">
                Bottleneck: {topBottleneck}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Радіус вузла залежить від OutDegree (review activity)
function nodeRadius(d: Pick<GraphNode, 'val' | 'outDegree'>): number {
  return Math.max(8, Math.min(d.val * 2 + 6, 28));
}
