import { createAuthClient } from "better-auth/react"

const apiBaseUrl = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/auth`
  : new URL("/api/auth", window.location.origin).toString()

export const authClient = createAuthClient({ baseURL: apiBaseUrl })
