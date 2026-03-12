import React, { useRef } from 'react';
import TopBar from '../components/layout/TopBar';
import LeftToolbar from '../components/layout/LeftToolbar';
import RightPanel from '../components/layout/RightPanel';
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
