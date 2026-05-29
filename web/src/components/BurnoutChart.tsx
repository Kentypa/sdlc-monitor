import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface BurnoutData {
  developerId: string;
  login: string;
  burnoutIndex: number;
}

interface BurnoutChartProps {
  data: BurnoutData[];
}

export default function BurnoutChart({ data }: BurnoutChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const width = svgRef.current.parentElement?.clientWidth || 600;
    const height = 350;
    const margin = { top: 30, right: 30, bottom: 60, left: 60 };

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    const getColor = (value: number) => {
      if (value >= 0.6) return '#ef4444'; // red-500
      if (value >= 0.3) return '#f59e0b'; // amber-500
      return '#10b981';                   // emerald-500
    };

    const x = d3.scaleBand()
      .domain(data.map(d => d.login))
      .range([margin.left, width - margin.right])
      .padding(0.3);

    const y = d3.scaleLinear()
      .domain([0, 1])
      .range([height - margin.bottom, margin.top]);

    // Initial structure setup (only runs once)
    if (svg.select('g.bars-layer').empty()) {
      svg.append('g').attr('class', 'grid');
      svg.append('g').attr('class', 'x-axis');
      svg.append('g').attr('class', 'y-axis');
      
      // Threshold lines
      svg.append('line').attr('class', 'warn-line');
      svg.append('text').attr('class', 'warn-text');
      svg.append('line').attr('class', 'crit-line');
      svg.append('text').attr('class', 'crit-text');

      svg.append('g').attr('class', 'bars-layer');
      svg.append('g').attr('class', 'labels-layer');
    }

    // Update axes
    svg.select<SVGGElement>('g.x-axis')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .transition().duration(400)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'translate(-10,0)rotate(-45)')
      .style('text-anchor', 'end')
      .style('fill', 'var(--text-muted)')
      .style('font-size', '12px');

    svg.select<SVGGElement>('g.y-axis')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${(Number(d) * 100).toFixed(0)}%`))
      .selectAll('text')
      .style('fill', 'var(--text-muted)');

    svg.select<SVGGElement>('g.grid')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).tickSize(-width + margin.left + margin.right).tickFormat(() => ''))
      .selectAll('line')
      .style('stroke', 'var(--border-color)')
      .style('stroke-dasharray', '3,3');

    // Update thresholds
    svg.select('line.warn-line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', y(0.3)).attr('y2', y(0.3))
      .style('stroke', '#f59e0b').style('stroke-width', 1.5).style('stroke-dasharray', '5,4');
    
    svg.select('text.warn-text')
      .attr('x', margin.left + 6).attr('y', y(0.3) - 5)
      .attr('text-anchor', 'start')
      .style('fill', '#f59e0b').style('font-size', '11px').style('font-weight', 'bold')
      .text('WARNING threshold (0.3)');

    svg.select('line.crit-line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', y(0.6)).attr('y2', y(0.6))
      .style('stroke', '#ef4444').style('stroke-width', 2).style('stroke-dasharray', '5,4');
    
    svg.select('text.crit-text')
      .attr('x', margin.left + 6).attr('y', y(0.6) - 5)
      .attr('text-anchor', 'start')
      .style('fill', '#ef4444').style('font-size', '11px').style('font-weight', 'bold')
      .text('CRITICAL threshold (0.6)');

    // Bars with update pattern
    svg.select('g.bars-layer')
      .selectAll('rect')
      .data(data, (d: any) => d.login)
      .join(
        enter => enter.append('rect')
          .attr('x', d => x(d.login)!)
          .attr('y', height - margin.bottom)
          .attr('width', x.bandwidth())
          .attr('height', 0)
          .attr('fill', d => getColor(d.burnoutIndex))
          .call(enter => enter.transition().duration(800)
            .attr('y', d => y(d.burnoutIndex))
            .attr('height', d => height - margin.bottom - y(d.burnoutIndex))
          ),
        update => update
          .call(update => update.transition().duration(400)
            .attr('x', d => x(d.login)!)
            .attr('width', x.bandwidth())
            .attr('y', d => y(d.burnoutIndex))
            .attr('height', d => height - margin.bottom - y(d.burnoutIndex))
            .attr('fill', d => getColor(d.burnoutIndex))
          ),
        exit => exit
          .call(exit => exit.transition().duration(400)
            .attr('y', height - margin.bottom)
            .attr('height', 0)
            .remove()
          )
      );

    // Labels with update pattern
    svg.select('g.labels-layer')
      .selectAll('text.value')
      .data(data, (d: any) => d.login)
      .join(
        enter => enter.append('text')
          .attr('class', 'value')
          .attr('x', d => x(d.login)! + x.bandwidth() / 2)
          .attr('y', d => y(d.burnoutIndex) - 5)
          .attr('text-anchor', 'middle')
          .style('fill', 'var(--text-main)')
          .style('font-size', '12px')
          .style('font-weight', 'bold')
          .style('opacity', 0)
          .text(d => (d.burnoutIndex).toFixed(2))
          .call(enter => enter.transition().duration(800).style('opacity', 1)),
        update => update
          .text(d => (d.burnoutIndex).toFixed(2))
          .call(update => update.transition().duration(400)
            .attr('x', d => x(d.login)! + x.bandwidth() / 2)
            .attr('y', d => y(d.burnoutIndex) - 5)
          ),
        exit => exit.remove()
      );

  }, [data]);

  return (
    <div className="w-full relative">
      <svg ref={svgRef} className="w-full h-auto overflow-visible"></svg>
    </div>
  );
}
