export default {
  extends: ["stylelint-config-standard"],
  rules: {
    "selector-class-pattern": null,
    "custom-property-pattern": null,
    "no-descending-specificity": null
  },
  ignoreFiles: [".nuxt/**", ".output/**", "dist/**", "node_modules/**"]
};
