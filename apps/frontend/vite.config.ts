import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json" with { type: "json" };
import { sites } from "./build/sites-vite-plugin.ts";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          migrations_dir: "drizzle",
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const d1PersistPath = process.env.EVI_X_D1_PERSIST_PATH?.trim();
  // Opt-in local emulation only. A production build never provisions a bucket
  // or silently sends user files to an external service.
  const localOfficeFiles = command === "serve" && process.env.EVI_X_OFFICE_LOCAL_FILES === "1";
  // Runtime-only local ONLYOFFICE settings. Never bake a shared signing secret
  // into a production bundle or client-side Vite define values.
  const localNativeVars = command === "serve"
    ? Object.fromEntries([
        "EVI_X_ONLYOFFICE_BROWSER_ORIGIN",
        "EVI_X_ONLYOFFICE_DOWNLOAD_ORIGIN",
        "EVI_X_ONLYOFFICE_APP_ORIGIN",
        "EVI_X_ONLYOFFICE_BROWSER_APP_ORIGIN",
        "EVI_X_ONLYOFFICE_SHELL_ORIGIN",
        "EVI_X_ONLYOFFICE_JWT_SECRET",
        "EVI_X_ONLYOFFICE_LOCAL_DEV",
      ].flatMap(name => process.env[name] ? [[name, process.env[name]]] : []))
    : {};
  const localAgentVars = command === 'serve'
    ? Object.fromEntries(['EVI_X_AGENT_MASTER_KEY','EVI_X_AGENT_KEY_ID','EVI_X_AGENT_ALLOWED_BASES','EVI_X_AGENT_DEMO','EVI_X_AGENT_INVITED_EMAILS','EVI_X_AGENT_MAIL_API_KEY','EVI_X_AGENT_MAIL_FROM'].flatMap(name=>process.env[name]?[[name,process.env[name]]]:[]))
    : {};

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        persistState: d1PersistPath ? { path: d1PersistPath } : true,
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: {
          ...localBindingConfig,
          vars: {
            ...(localOfficeFiles ? { EVI_X_OFFICE_STORAGE_MODE: "local" } : {}),
            ...localNativeVars,
            ...localAgentVars,
          },
          ...(localOfficeFiles ? {
            r2_buckets: [...localBindingConfig.r2_buckets, { binding: "OFFICE_FILES", bucket_name: "evix-office-local" }],
          } : {}),
        },
      }),
    ],
  };
});
