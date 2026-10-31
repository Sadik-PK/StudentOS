import "dotenv/config"

import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().url(),

  DIRECT_URL: z.string().url(),

  BETTER_AUTH_SECRET: z.string().min(32),

  BETTER_AUTH_URL: z.string().url(),

  FRONTEND_ORIGINS: z.string().min(1),

  PORT: z.coerce.number().int().positive().default(3001),

  AI_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),

  GEMINI_API_KEY: z.string().optional().or(z.literal("")),

  OPENAI_API_KEY: z.string().optional().or(z.literal("")),

  AI_GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),

  AI_OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),

  GOOGLE_DRIVE_CLIENT_ID: z.string().optional().or(z.literal("")),

  GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional().or(z.literal("")),

  GOOGLE_DRIVE_REFRESH_TOKEN: z.string().optional().or(z.literal("")),

  GOOGLE_DRIVE_FOLDER_ID: z.string().optional().or(z.literal("")),

  GOOGLE_DRIVE_REDIRECT_URI: z.string().url().optional().or(z.literal("")),

  GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: z.string().optional().or(z.literal("")),

  GOOGLE_DRIVE_ADMIN_EMAIL: z.string().email().optional().or(z.literal("")),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  throw new Error(
    `Invalid server environment: ${JSON.stringify(z.treeifyError(parsed.error))}`,
  )
}

const googleDriveClientValues = [
  parsed.data.GOOGLE_DRIVE_CLIENT_ID,
  parsed.data.GOOGLE_DRIVE_CLIENT_SECRET,
]

const configuredGoogleDriveClientValues = googleDriveClientValues.filter(Boolean).length

if (configuredGoogleDriveClientValues === 1) {
  throw new Error(
    "Configure both Google Drive OAuth client values or leave both empty.",
  )
}

if (
  parsed.data.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY &&
  (!/^[A-Za-z0-9+/]+={0,2}$/.test(parsed.data.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY) ||
    Buffer.from(parsed.data.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY, "base64").length !== 32)
) {
  throw new Error("GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.")
}

export const env = {
  ...parsed.data,

  FRONTEND_ORIGINS: parsed.data.FRONTEND_ORIGINS.split(",").map((origin) =>
    origin.trim(),
  ),

  GOOGLE_DRIVE_ENABLED: configuredGoogleDriveClientValues === googleDriveClientValues.length,
}
