import { config } from "dotenv";

// Mesma precedência do Next.js: .env.local sobrescreve .env
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
