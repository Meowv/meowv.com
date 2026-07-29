import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";
import skipFormatting from "@vue/eslint-config-prettier/skip-formatting";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "public/**"],
  },
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/essential"],
  {
    files: ["**/*.{ts,vue}"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".vue"],
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "vue/multi-word-component-names": "off",
    },
  },
  skipFormatting,
);
