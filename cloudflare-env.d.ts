// Cloudflare environment bindings. Database is now Neon PostgreSQL via DATABASE_URL.

declare global {
  interface CloudflareEnv {
    ASSETS: Fetcher;
  }
}

export {};
