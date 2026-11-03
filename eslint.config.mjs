import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // typescript-eslint's strictest rules. They read the types, so they catch
  // bugs plain linting can't see: a promise nobody waits for, a check that is
  // always true, a value that may be undefined. `npm run lint` caches results,
  // because these rules are slow on a whole project.
  {
    files: ["**/*.ts", "**/*.tsx"],
    // shadcn's generated components: the shadcn CLI replaces them when they're
    // regenerated, so they keep the default rules above.
    ignores: ["components/ui/**"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Numbers read fine in text: `${count} reports`.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // Style only: it bans `() => setOpen(false)` style arrow functions.
      "@typescript-eslint/no-confusing-void-expression": "off",
      // Next.js needs some functions to be async even with no await inside:
      // 'use cache' functions, route handlers and next.config's rewrites. So
      // does the Splunk transport's interface.
      "@typescript-eslint/require-await": "off",
      // node:test runs test() and describe() itself, so they needn't be awaited.
      "@typescript-eslint/no-floating-promises": ["error", {
        allowForKnownSafeCalls: [{ from: "package", name: ["test", "describe", "it", "suite"], package: "node:test" }],
      }],
    },
  },
  // Tests may say "this is there" with `!`: a wrong guess fails the test anyway.
  {
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The ML job's Python environment (ml/README.md), which holds its
    // packages' own JavaScript.
    "ml/.venv/**",
  ]),
]);

export default eslintConfig;
