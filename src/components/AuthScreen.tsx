import { FormEvent, useState } from "react"

import { authClient } from "../auth"

export default function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login")

  const [name, setName] = useState("")

  const [email, setEmail] = useState("")

  const [password, setPassword] = useState("")

  const [error, setError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError(null)

    setSubmitting(true)

    try {
      const result =
        mode === "register"
          ? await authClient.signUp.email({ name, email, password })
          : await authClient.signIn.email({ email, password })

      if (result.error)
        setError(result.error.message ?? "Authentication failed.")
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Authentication failed.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-full bg-[#080b0f] text-[#cdd5df] flex items-center justify-center p-4">
      <div className="w-full max-w-sm border border-[#19222e] bg-[#0d1219]">
        <div className="px-5 py-4 border-b border-[#19222e]">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-amber-400 font-bold text-sm tracking-wider">
              STUDENT
            </span>
            <span className="font-mono text-[#2a3548] text-xs">/</span>
            <span className="font-mono text-[#4e5e72] text-xs tracking-wider">
              OS
            </span>
          </div>
          <p className="font-mono text-[10px] tracking-widest text-[#4e5e72] mt-3">
            {mode === "login" ? "SECURE ACCOUNT ACCESS" : "CREATE YOUR ACCOUNT"}
          </p>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {mode === "register" && (
            <label className="block">
              <span className="font-mono text-[10px] text-[#4e5e72]">
                DISPLAY NAME
              </span>
              <input
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full mt-1 px-2 py-2 text-sm"
                autoComplete="name"
              />
            </label>
          )}
          <label className="block">
            <span className="font-mono text-[10px] text-[#4e5e72]">EMAIL</span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full mt-1 px-2 py-2 text-sm"
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] text-[#4e5e72]">
              PASSWORD
            </span>
            <input
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full mt-1 px-2 py-2 text-sm"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </label>

          {error && (
            <p role="alert" className="font-mono text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 font-mono text-xs tracking-wider bg-amber-400 text-[#090b0e] font-semibold hover:bg-amber-300 disabled:opacity-50"
          >
            {submitting
              ? "CONNECTING..."
              : mode === "login"
                ? "LOG IN"
                : "CREATE ACCOUNT"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login")
              setError(null)
            }}
            className="w-full py-1 font-mono text-[10px] text-[#4e5e72] hover:text-[#cdd5df]"
          >
            {mode === "login"
              ? "NEW TO STUDENT/OS? CREATE ACCOUNT"
              : "ALREADY HAVE AN ACCOUNT? LOG IN"}
          </button>
        </form>
      </div>
    </div>
  )
}
