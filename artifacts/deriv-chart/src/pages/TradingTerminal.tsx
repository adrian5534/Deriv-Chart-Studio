import React, { useRef } from 'react';
import { MousePointer2, TrendingUp, Minus, Square, Divide, ArrowUpRight, ArrowDownRight, Trash2 } from 'lucide-react';
import { useChartStore, DrawingTool } from '../store/use-chart-store';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import TopBar from '../components/layout/TopBar';
import RightPanel from '../components/layout/RightPanel';
import LeftToolbar from '../components/layout/LeftToolbar';
import LightweightChart, { ChartRef } from '../components/chart/LightweightChart';

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