import React from 'react';
import TopBar from '../components/layout/TopBar';
import LeftToolbar from '../components/layout/LeftToolbar';
import RightPanel from '../components/layout/RightPanel';
import LightweightChart from '../components/chart/LightweightChart';

export default function TradingTerminal() {
  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden font-sans">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftToolbar />
        <main className="flex-1 relative bg-[#0B0E14]">
          <LightweightChart />
        </main>
        <RightPanel />
      </div>
    </div>
  );
}
