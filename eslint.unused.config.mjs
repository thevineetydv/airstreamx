// eslint.unused.config.mjs
//
// A standalone, minimal ESLint config with ONE job: find and auto-remove
// unused imports and variables across the whole codebase in one command.
// Doesn't touch or require your existing ESLint setup (if you have one).
//
// SETUP (one-time):
//   npm install -D eslint @typescript-eslint/parser eslint-plugin-unused-imports
//
// USAGE:
//   Preview what would change (safe, no files touched):
//     npx eslint --config eslint.unused.config.mjs src --ext .ts,.tsx
//
//   Actually apply the fixes:
//     npx eslint --config eslint.unused.config.mjs src --ext .ts,.tsx --fix
//
// ⚠️ Commit your current work first (or make sure it's already committed)
// so --fix is trivially reversible with `git diff` / `git checkout` if
// anything looks wrong.

import unusedImports from "eslint-plugin-unused-imports";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      // Turns off the base rule in favor of the plugin's version, which
      // is what actually knows how to auto-remove the unused import line
      // itself (not just warn about it).
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
];
