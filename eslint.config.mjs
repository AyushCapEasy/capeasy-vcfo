import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Gitignored non-source dirs (D-007/D-014): real client-data + vendored design
    // prototype + generated exports. Never part of the lint gate — eslint doesn't
    // read .gitignore, so they must be ignored explicitly.
    ".client-data.local/**",
    "outputs/**",
  ]),
]);

export default eslintConfig;
