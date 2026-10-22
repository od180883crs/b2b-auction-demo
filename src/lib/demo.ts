// Демо-акаунти для швидкого входу (створює scripts/seed.mjs). Пароль публічний — це демо.
export const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";
export const DEMO_ACCOUNTS = [
  { key: "demoBuyer1", email: "buyer1@demo.local" },
  { key: "demoBuyer2", email: "buyer2@demo.local" },
  { key: "demoAdmin", email: "admin@demo.local" },
] as const;
