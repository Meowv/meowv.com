import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@pdf": fileURLToPath(new URL("./core/pdf", import.meta.url))
    }
  },
  test: {
    environment: "happy-dom",
    include: ["tests/{unit,integration}/**/*.{test,spec}.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
