import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import darkContrast from "./eslint-rules/dark-contrast.js";

const config = [
  { ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "src/lib/supabase/database.types.ts"] },
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["**/*.tsx"],
    plugins: { "dark-contrast": darkContrast },
    rules: {
      "dark-contrast/inverted-muted-text": "error",
    },
  },
];

export default config;
