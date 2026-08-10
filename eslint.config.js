import js from "@eslint/js";
import vue from "eslint-plugin-vue";
import prettier from "eslint-config-prettier";
import globals from "globals";

// Flat config. The app is plain browser ESM — no bundler-specific globals, no
// Node at runtime — so `globals.browser` is the whole environment.
export default [
  { ignores: ["dist/**"] },

  js.configs.recommended,
  ...vue.configs["flat/recommended"],

  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: globals.browser,
    },
    rules: {
      // A caught error the handler deliberately ignores is idiomatic here: several
      // `catch { … }` blocks fall back to a default rather than inspect the error.
      "no-unused-vars": ["error", { caughtErrors: "none", argsIgnorePattern: "^_" }],
      // Nothing user-facing should reach the console — errors go to the status
      // line (setStatus) or the ClickUp pill, which the user can actually see.
      "no-console": "warn",
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  // Prettier owns formatting. Last, so it switches off the stylistic rules the
  // configs above turn on rather than fighting them.
  prettier,
];
