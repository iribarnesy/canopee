import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  base: "./",
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Les tests écologiques simulent des décennies sur des grilles de milliers
    // de cellules : le défaut de 5 s ne suffit pas, surtout sur les runners CI.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
