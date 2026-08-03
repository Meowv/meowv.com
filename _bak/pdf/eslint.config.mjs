import withNuxt from "./.nuxt/eslint.config.mjs";
import prettier from "eslint-config-prettier";

export default withNuxt(
  {
    files: ["**/*.{ts,vue}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "vue/multi-word-component-names": "off"
    }
  },
  prettier,
  {
    ignores: [".nuxt/**", ".output/**", "dist/**", "node_modules/**"]
  }
);
