import React, { useRef } from 'react';
import { MousePointer2, TrendingUp, Minus, Square, Divide, ArrowUpRight, ArrowDownRight, Trash2 } from 'lucide-react';
import { useChartStore, DrawingTool } from '../store/use-chart-store';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import TopBar from '../components/layout/TopBar';
import RightPanel from '../components/layout/RightPanel';
import LightweightChart, { ChartRef } from '../components/chart/LightweightChart';

const tools: { id: DrawingTool; icon: React.ReactNode; label: string }[] = [
  { id: 'cursor', icon: <MousePointer2 size={18} />, label: 'Cursor' },
  { id: 'trendline', icon: <TrendingUp size={18} />, label: 'Trend Line' },
  { id: 'hline', icon: <Minus size={18} />, label: 'Horizontal Line' },
  { id: 'fib', icon: <Divide size={18} />, label: 'Fibonacci Retracement' },
  { id: 'rect', icon: <Square size={18} />, label: 'Rectangle' },
  { id: 'ray', icon: <ArrowUpRight size={18} />, label: 'Ray' },
  { id: 'rrLong', icon: <ArrowUpRight size={18} />, label: 'Risk / Reward (Long)' },
  { id: 'rrShort', icon: <ArrowDownRight size={18} />, label: 'Risk / Reward (Short)' },
];

function LeftToolbar() {
  const activeTool = useChartStore((s) => s.activeTool);
  const setActiveTool = useChartStore((s) => s.setActiveTool);
  const clearDrawings = useChartStore((s) => s.clearDrawings);

  return (
    <div className="w-14 bg-card border-r border-border flex flex-col items-center py-4 gap-2 z-20">
      {tools.map(tool => (
        <Tooltip key={tool.id} delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setActiveTool(tool.id)}
              className={`p-2.5 rounded-lg transition-colors duration-200 ${
                activeTool === tool.id 
                  ? 'bg-primary/20 text-primary' 
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              {tool.icon}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="ml-2">
            <p>{tool.label}</p>
          </TooltipContent>
        </Tooltip>
      ))}

      <div className="w-8 h-[1px] bg-border my-2" />

      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button
            onClick={clearDrawings}
            className="p-2.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-200"
          >
            <Trash2 size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="ml-2">
          <p>Remove All Drawings</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export default function TradingTerminal() {
  const chartRef = useRef<ChartRef>(null);

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden font-sans">
      <TopBar chartRef={chartRef} />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <LeftToolbar />
        <main className="flex-1 relative min-w-0 min-h-0">
          <LightweightChart ref={chartRef} />
        </main>
        <RightPanel />
      </div>
    </div>
  );
}