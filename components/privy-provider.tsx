"use client";

import { PrivyProvider } from "@privy-io/react-auth";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export function AppPrivyProvider({ children }: { children: React.ReactNode }) {
  // During static build the env var may be absent — render children unwrapped
  // so prerendering doesn't throw. At runtime the real app ID is always present.
  if (!PRIVY_APP_ID) return <>{children}</>;

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#10b981",
          logo: "/ski-logo.png",
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
