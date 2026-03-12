export const DERIV_APP_ID = "1089";
export const DERIV_WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`;

export const ASSETS = [
  { symbol: "R_10", name: "Volatility 10 Index", pipSize: 3 },
  { symbol: "R_25", name: "Volatility 25 Index", pipSize: 3 },
  { symbol: "R_50", name: "Volatility 50 Index", pipSize: 4 },
  { symbol: "R_75", name: "Volatility 75 Index", pipSize: 4 },
  { symbol: "R_100", name: "Volatility 100 Index", pipSize: 2 },
  { symbol: "BOOM1000", name: "Boom 1000 Index", pipSize: 4 },
  { symbol: "BOOM500", name: "Boom 500 Index", pipSize: 4 },
  { symbol: "CRASH1000", name: "Crash 1000 Index", pipSize: 4 },
  { symbol: "CRASH500", name: "Crash 500 Index", pipSize: 4 },
  { symbol: "JD10", name: "Jump 10 Index", pipSize: 3 },
  { symbol: "JD25", name: "Jump 25 Index", pipSize: 3 },
  { symbol: "JD50", name: "Jump 50 Index", pipSize: 4 },
  { symbol: "JD75", name: "Jump 75 Index", pipSize: 4 },
  { symbol: "JD100", name: "Jump 100 Index", pipSize: 2 },
];

export const TIMEFRAMES = [
  { label: "1s", value: 1 },
  { label: "1m", value: 60 },
  { label: "5m", value: 300 },
  { label: "15m", value: 900 },
  { label: "1h", value: 3600 },
  { label: "4h", value: 14400 },
  { label: "1d", value: 86400 },
];
