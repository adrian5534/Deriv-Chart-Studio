import { useEffect, useRef, useState, useCallback } from 'react';
import { DERIV_WS_URL } from '../lib/deriv-constants';
import { useChartStore } from '../store/use-chart-store';
import { Time } from 'lightweight-charts';

export interface CandleData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface UseDerivWebSocketProps {
  onHistoricalData: (data: CandleData[]) => void;
  onLiveUpdate: (data: CandleData) => void;
}

export function useDerivWebSocket({ onHistoricalData, onLiveUpdate }: UseDerivWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const subscriptionIdRef = useRef<string | null>(null);
  
  const symbol = useChartStore(s => s.symbol);
  const timeframe = useChartStore(s => s.timeframe);
  const setLivePrice = useChartStore(s => s.setLivePrice);
  const setConnectionStatus = useChartStore(s => s.setConnectionStatus);
  const replayActive = useChartStore(s => s.replay.active);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus('connecting');
    const ws = new WebSocket(DERIV_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      subscribeToAsset();
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);

      if (data.msg_type === 'candles') {
        // Historical data
        const candles: CandleData[] = data.candles.map((c: any) => ({
          time: c.epoch as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        // Optional: filter by replay date here if replay mode is active
        onHistoricalData(candles);
        if (data.subscription?.id) {
           subscriptionIdRef.current = data.subscription.id;
        }
      } 
      else if (data.msg_type === 'ohlc') {
        // Live update
        const c = data.ohlc;
        const liveCandle: CandleData = {
          time: c.open_time as Time,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
        };
        setLivePrice(parseFloat(c.close));
        if (!replayActive) {
          onLiveUpdate(liveCandle);
        }
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      setTimeout(connect, 3000); // Auto reconnect
    };
    
    ws.onerror = () => {
      setConnectionStatus('disconnected');
    };
  }, [symbol, timeframe, replayActive, onHistoricalData, onLiveUpdate, setConnectionStatus, setLivePrice]);

  const subscribeToAsset = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Unsubscribe previous if exists
    if (subscriptionIdRef.current) {
      wsRef.current.send(JSON.stringify({ forget: subscriptionIdRef.current }));
      subscriptionIdRef.current = null;
    }

    // Subscribe to new
    wsRef.current.send(JSON.stringify({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: 1000,
      end: "latest",
      start: 1,
      style: "candles",
      granularity: timeframe,
      subscribe: 1
    }));
  }, [symbol, timeframe]);

  // Initial connect
  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        if (subscriptionIdRef.current) {
           wsRef.current.send(JSON.stringify({ forget: subscriptionIdRef.current }));
        }
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Handle symbol/timeframe change
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      subscribeToAsset();
    }
  }, [symbol, timeframe, subscribeToAsset]);

  return { isConnected: wsRef.current?.readyState === WebSocket.OPEN };
}
