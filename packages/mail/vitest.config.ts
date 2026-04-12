import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "mail",
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
