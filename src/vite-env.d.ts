/// <reference types="vite/client" />

declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SUPABASE_SERVICE_ROLE_KEY: string;
  readonly VITE_GITHUB_TOKEN: string;
  readonly VITE_GITHUB_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "elkjs/lib/elk-api.js" {
  import type { ELK } from "elkjs";
  export default ELK;
  export type { ELK };
}

declare module "elkjs/lib/elk-worker.min.js?url" {
  const workerUrl: string;
  export default workerUrl;
}
