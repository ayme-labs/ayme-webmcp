import config from "@ayme-dev/eslint-config/base";

export default [
  ...config,
  { ignores: [".next/**", ".next-dev/**", "next-env.d.ts"] },
];
