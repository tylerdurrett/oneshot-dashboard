/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_PORT: string;
  readonly VITE_FEATURE_TIMERS: boolean;
  readonly VITE_FEATURE_CHAT: boolean;
  readonly VITE_FEATURE_VIDEO: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
