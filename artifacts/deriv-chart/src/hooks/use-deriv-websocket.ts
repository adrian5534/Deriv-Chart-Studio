import { useEffect, useRef, useCallback } from 'react';
import { DERIV_WS_URL } from '../lib/deriv-constants';
import { useChartStore } from '../store/use-chart-store';
import { UTCTimestamp } from 'lightweight-charts';

export interface CandleData {
  time: UTCTimestamp;  // always a plain number — never a string or BusinessDay object
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
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const symbol = useChartStore(s => s.symbol);
  const timeframe = useChartStore(s => s.timeframe);
  const replayActive = useChartStore(s => s.replay.active);
  const setLivePrice = useChartStore(s => s.setLivePrice);
  const setConnectionStatus = useChartStore(s => s.setConnectionStatus);

  const sendMsg = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const subscribeToAsset = useCallback(() => {
    // Unsubscribe previous stream
    if (subscriptionIdRef.current) {
      sendMsg({ forget: subscriptionIdRef.current });
      subscriptionIdRef.current = null;
    }

    // Request 1000 historical candles + subscribe to live stream
    sendMsg({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: 1000,
      end: 'latest',
      start: 1,
      style: 'candles',
      granularity: timeframe,
      subscribe: 1,
    });
  }, [symbol, timeframe, sendMsg]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    setConnectionStatus('connecting');
    const ws = new WebSocket(DERIV_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      subscribeToAsset();
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);

        if (data.error) {
          console.warn('[Deriv WS] Error:', data.error.message);
          return;
        }

        if (data.msg_type === 'candles') {
          // Historical candle batch
          const candles: CandleData[] = (data.candles || []).map((c: any) => ({
            time: Number(c.epoch) as UTCTimestamp,
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close),
          }));
          if (data.subscription?.id) {
            subscriptionIdRef.current = data.subscription.id;
          }
          onHistoricalData(candles);
        }
        else if (data.msg_type === 'ohlc') {
          // Live candle tick — update the latest candle
          const c = data.ohlc;
          const liveCandle: CandleData = {
            time: Number(c.open_time) as UTCTimestamp,
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
      } catch (e) {
        console.warn('[Deriv WS] Parse error', e);
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      // Auto-reconnect after 3s
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
    };
  }, [symbol, timeframe, subscribeToAsset, setConnectionStatus, setLivePrice, replayActive, onHistoricalData, onLiveUpdate]);

  // Initial connect
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        if (subscriptionIdRef.current) {
          sendMsg({ forget: subscriptionIdRef.current });
        }
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-subscribe when symbol or timeframe changes
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      subscribeToAsset();
    }
  }, [symbol, timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load a batch of historical candles for chart replay mode
  // Returns them via the onHistoricalData callback without subscribing
  const loadReplayCandles = useCallback((date: string): Promise<CandleData[]> => {
    return new Promise((resolve) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        resolve([]);
        return;
      }

      const endEpoch = Math.floor(new Date(date).getTime() / 1000);
      const reqId = 9999;

      const handler = (msg: MessageEvent) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.msg_type === 'candles' && data.req_id === reqId) {
            wsRef.current?.removeEventListener('message', handler);
            const candles: CandleData[] = (data.candles || []).map((c: any) => ({
              time: Number(c.epoch) as UTCTimestamp,
              open: parseFloat(c.open),
              high: parseFloat(c.high),
              low: parseFloat(c.low),
              close: parseFloat(c.close),
            }));
            resolve(candles);
          }
        } catch {
          resolve([]);
        }
      };

      wsRef.current.addEventListener('message', handler);

      // Request 500 candles ending at the selected replay date (no subscribe)
      wsRef.current.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: 500,
        end: endEpoch,
        style: 'candles',
        granularity: timeframe,
        req_id: reqId,
      }));

      // Timeout after 8s
      setTimeout(() => {
        wsRef.current?.removeEventListener('message', handler);
        resolve([]);
      }, 8000);
    });
  }, [symbol, timeframe]);

  return { loadReplayCandles };
}
