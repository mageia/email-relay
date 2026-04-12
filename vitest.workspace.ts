import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/api/vitest.config.ts",
  "packages/mail/vitest.config.ts",
  "apps/server/vitest.config.ts",
  "apps/web/vitest.config.ts",
]);
