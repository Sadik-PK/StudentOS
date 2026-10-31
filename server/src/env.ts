import "dotenv/config"

import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().url(),

  DIRECT_URL: z.string().url(),

  BETTER_AUTH_SECRET: z.string().min(32),

  BETTER_AUTH_URL: z.string().url(),

  FRONTEND_ORIGINS: z.string().min(1),

  PORT: z.coerce.number().int().positive().default(3001),

  R2_ENDPOINT: z.string().url().optional().or(z.literal("")),

  R2_ACCESS_KEY_ID: z.string().optional().or(z.literal("")),

  R2_SECRET_ACCESS_KEY: z.string().optional().or(z.literal("")),

  R2_BUCKET: z.string().optional().or(z.literal("")),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  throw new Error(
    `Invalid server environment: ${JSON.stringify(z.treeifyError(parsed.error))}`,
  )
}

const r2Values = [
  parsed.data.R2_ENDPOINT,

  parsed.data.R2_ACCESS_KEY_ID,

  parsed.data.R2_SECRET_ACCESS_KEY,

  parsed.data.R2_BUCKET,
]

const configuredR2Values = r2Values.filter(Boolean).length

if (configuredR2Values > 0 && configuredR2Values !== r2Values.length) {
  throw new Error(
    "Configure all R2 environment variables or leave all of them empty.",
  )
}

export const env = {
  ...parsed.data,

  FRONTEND_ORIGINS: parsed.data.FRONTEND_ORIGINS.split(",").map((origin) =>
    origin.trim(),
  ),

  R2_ENABLED: configuredR2Values === r2Values.length,
}
