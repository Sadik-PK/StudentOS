import { betterAuth } from "better-auth"

import { prismaAdapter } from "better-auth/adapters/prisma"

import { env } from "./env.js"

import { prisma } from "./db.js"

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  baseURL: env.BETTER_AUTH_URL,

  secret: env.BETTER_AUTH_SECRET,

  trustedOrigins: env.FRONTEND_ORIGINS,
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      secure: env.BETTER_AUTH_URL.startsWith("https://"),
      sameSite: env.BETTER_AUTH_URL.startsWith("https://") ? "none" : "lax",
    },
  },

  emailAndPassword: {
    enabled: true,

    requireEmailVerification: false,
  },

  session: {
    cookieCache: {
      enabled: false,
    },
  },
})
