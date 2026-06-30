// Freighter (Stellar browser wallet) provider types
// Accessed via window.freighter — no wallet-kit library required.

interface FreighterApi {
  isConnected: () => Promise<boolean>;
  getPublicKey: () => Promise<string>;
  getNetworkDetails: () => Promise<{ network: string; networkPassphrase: string }>;
  signTransaction: (
    xdr: string,
    opts?: { network?: string; networkPassphrase?: string; accountToSign?: string },
  ) => Promise<string>;
  signBlob: (blob: string, opts?: { accountToSign?: string }) => Promise<{ result: string }>;
}

interface Window {
  freighter?: FreighterApi;
}
