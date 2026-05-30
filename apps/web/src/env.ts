import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const isProd =
  process.env.NODE_ENV === "production" && !process.env.SKIP_ENV_VALIDATION;

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url().optional(),
    AUTH_SECRET: z.string().min(32),
    AUTH_URL: z.string().url().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    SUPABASE_URL: isProd ? z.string().url() : z.string().url().optional(),
    SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: isProd
      ? z.string().min(1)
      : z.string().optional(),
    SUPABASE_STORAGE_BUCKET_PUBLIC: z.string().optional(),
    SUPABASE_STORAGE_BUCKET_PRIVATE: isProd
      ? z.string().min(1)
      : z.string().optional(),
    CRON_SECRET: isProd ? z.string().min(16) : z.string().optional(),
    TELEGRAM_WEBHOOK_SECRET: isProd
      ? z.string().min(16)
      : z.string().optional(),
    ENCRYPTION_KEY: isProd ? z.string().min(32) : z.string().min(32).optional(),
    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_APP_NAME: z.string().default("KameOps"),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_STORAGE_BUCKET_PUBLIC: process.env.SUPABASE_STORAGE_BUCKET_PUBLIC,
    SUPABASE_STORAGE_BUCKET_PRIVATE:
      process.env.SUPABASE_STORAGE_BUCKET_PRIVATE,
    CRON_SECRET: process.env.CRON_SECRET,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
