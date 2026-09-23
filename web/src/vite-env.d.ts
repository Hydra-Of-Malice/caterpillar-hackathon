/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EDGE_URL?: string;
  readonly VITE_CLOUD_URL?: string;
  readonly VITE_EDGE_WS?: string;
  readonly VITE_MQTT_URL?: string;
  readonly VITE_FORCE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
