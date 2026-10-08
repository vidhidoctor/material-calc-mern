import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z
    .string()
    .trim()
    .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),
  CORS_ORIGIN: z.string().trim().min(1).default('http://localhost:5173'),
  /** Only needed by the seed script (first Admin user). */
  ADMIN_EMAIL: z.email('must be a valid email').optional(),
  ADMIN_PASSWORD: z.string().min(8, 'must be at least 8 characters').optional(),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvError';
  }
}

/** Validates environment variables; throws EnvError listing every bad variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // Treat empty values (e.g. "ADMIN_EMAIL=" in .env) as not set.
  const raw = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value !== ''));
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const name = issue.path.join('.');
    return `  - ${name}: ${raw[name] === undefined ? 'missing' : issue.message}`;
  });
  throw new EnvError(`Invalid environment variables (check server/.env):\n${lines.join('\n')}`);
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Loads server/.env into process.env if the file exists (real variables win). */
export function loadDotEnv(): void {
  const path = fileURLToPath(new URL('../../.env', import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}
