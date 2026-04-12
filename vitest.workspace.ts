import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/api/vitest.config.ts",
  "apps/web/vitest.config.ts",
]);
