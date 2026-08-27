/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<
    Record<string, never>,
    Record<string, never>,
    unknown
  >;
  export default component;
}

declare global {
  interface Window {
    __AYME_VUE_ACTIONS__: string[];
    __AYME_DISABLE_RELAY__?: boolean;
    __AYME_WEBMCP_TOOLS__?: Array<{
      name: string;
      description: string;
      inputSchema: unknown;
      execute(args: unknown): Promise<unknown>;
    }>;
  }
}

export {};
