export const DERIV_APP_ID = "1089";
export const DERIV_WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`;

export const ASSETS = [
  // Volatility Indices
  { symbol: "R_10", name: "Volatility 10 Index", pipSize: 3 },
  { symbol: "R_25", name: "Volatility 25 Index", pipSize: 3 },
  { symbol: "R_50", name: "Volatility 50 Index", pipSize: 4 },
  { symbol: "R_75", name: "Volatility 75 Index", pipSize: 4 },
  { symbol: "R_100", name: "Volatility 100 Index", pipSize: 2 },

  // Volatility Indices (1s)
  { symbol: "1HZ10V", name: "Volatility 10 (1s) Index", pipSize: 3 },
  { symbol: "1HZ25V", name: "Volatility 25 (1s) Index", pipSize: 3 },
  { symbol: "1HZ50V", name: "Volatility 50 (1s) Index", pipSize: 4 },
  { symbol: "1HZ75V", name: "Volatility 75 (1s) Index", pipSize: 4 },
  { symbol: "1HZ100V", name: "Volatility 100 (1s) Index", pipSize: 2 },

  // Boom Indices
  { symbol: "BOOM300N", name: "Boom 300 Index", pipSize: 2 },
  { symbol: "BOOM500", name: "Boom 500 Index", pipSize: 4 },
  { symbol: "BOOM1000", name: "Boom 1000 Index", pipSize: 4 },

  // Crash Indices
  { symbol: "CRASH300N", name: "Crash 300 Index", pipSize: 2 },
  { symbol: "CRASH500", name: "Crash 500 Index", pipSize: 4 },
  { symbol: "CRASH1000", name: "Crash 1000 Index", pipSize: 4 },

  // Jump Indices
  { symbol: "JD10", name: "Jump 10 Index", pipSize: 3 },
  { symbol: "JD25", name: "Jump 25 Index", pipSize: 3 },
  { symbol: "JD50", name: "Jump 50 Index", pipSize: 4 },
  { symbol: "JD75", name: "Jump 75 Index", pipSize: 4 },
  { symbol: "JD100", name: "Jump 100 Index", pipSize: 2 },
] as const;

export const TIMEFRAMES = [
  { label: "1m", value: 60 },
  { label: "2m", value: 120 },
  { label: "3m", value: 180 },
  { label: "5m", value: 300 },
  { label: "10m", value: 600 },
  { label: "15m", value: 900 },
  { label: "30m", value: 1800 },
  { label: "1h", value: 3600 },
  { label: "2h", value: 7200 },
  { label: "4h", value: 14400 },
  { label: "8h", value: 28800 },
  { label: "1d", value: 86400 },
] as const;

export const ASSET_MAP = Object.fromEntries(
  ASSETS.map((asset) => [asset.symbol, asset]),
) as Record<(typeof ASSETS)[number]["symbol"], (typeof ASSETS)[number]>;

export const TIMEFRAME_MAP = Object.fromEntries(
  TIMEFRAMES.map((timeframe) => [timeframe.value, timeframe]),
) as Record<(typeof TIMEFRAMES)[number]["value"], (typeof TIMEFRAMES)[number]>;