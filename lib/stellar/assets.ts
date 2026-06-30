// Stellar asset registry — mainnet assets on the Stellar network

export interface StellarAsset {
  symbol: string;
  name: string;
  code: string;           // Stellar asset code (e.g. "USDC")
  issuer: string | null;  // null = XLM (native asset)
  decimals: number;
  pythSymbol: string;     // Pyth price feed symbol for candles
  binancePair: string;    // Binance pair for OHLCV candle fallback
  coingeckoId: string;    // CoinGecko ID for metadata/sparklines
}

// USDC on Stellar — issued by Circle
export const STELLAR_USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

// AQUA on Stellar — Aquarius DEX governance token
export const STELLAR_AQUA_ISSUER = "GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA";

export const STELLAR_ASSETS: StellarAsset[] = [
  {
    symbol: "XLM",
    name: "Stellar Lumens",
    code: "XLM",
    issuer: null,
    decimals: 7,
    pythSymbol: "Crypto.XLM/USD",
    binancePair: "XLMUSDT",
    coingeckoId: "stellar",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    code: "USDC",
    issuer: STELLAR_USDC_ISSUER,
    decimals: 7,
    pythSymbol: "Crypto.USDC/USD",
    binancePair: "USDCUSDT",
    coingeckoId: "usd-coin",
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    code: "BTC",
    issuer: null,
    decimals: 8,
    pythSymbol: "Crypto.BTC/USD",
    binancePair: "BTCUSDT",
    coingeckoId: "bitcoin",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    code: "ETH",
    issuer: null,
    decimals: 8,
    pythSymbol: "Crypto.ETH/USD",
    binancePair: "ETHUSDT",
    coingeckoId: "ethereum",
  },
  {
    symbol: "SOL",
    name: "Solana",
    code: "SOL",
    issuer: null,
    decimals: 9,
    pythSymbol: "Crypto.SOL/USD",
    binancePair: "SOLUSDT",
    coingeckoId: "solana",
  },
];

export const STELLAR_HORIZON_MAINNET = "https://horizon.stellar.org";
export const STELLAR_HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
export const STELLAR_NETWORK_PASSPHRASE_MAINNET = "Public Global Stellar Network ; September 2015";
export const STELLAR_NETWORK_PASSPHRASE_TESTNET = "Test SDF Network ; September 2015";
export const STELLAR_EXPLORER_BASE = "https://stellar.expert/explorer/public";

export function getStellarAsset(symbol: string): StellarAsset | undefined {
  return STELLAR_ASSETS.find(a => a.symbol === symbol.toUpperCase());
}

// Display symbols in Pyth format ("XLM/USD") — used by the CFO engine
export const STELLAR_DISPLAY_SYMBOLS = STELLAR_ASSETS.map(a => `${a.symbol}/USD`);
