import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_TTL: z.string().default('7d'),
  STORAGE_DRIVER: z.enum(['s3', 'supabase', 'local']).default('s3'),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_REGION: z.string().min(1),
  STORAGE_ENDPOINT: z.string().optional().or(z.literal('')),
  STORAGE_ACCESS_KEY_ID: z.string().optional().or(z.literal('')),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional().or(z.literal('')),
  STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  TURN_URL: z.string().optional().or(z.literal('')),
  TURN_USERNAME: z.string().optional().or(z.literal('')),
  TURN_PASSWORD: z.string().optional().or(z.literal(''))
});

export type AppEnv = z.infer<typeof envSchema>;
