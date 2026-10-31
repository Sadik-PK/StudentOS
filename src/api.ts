const API_BASE_URL = import.meta.env.VITE_API_URL ?? ""

export class ApiError extends Error {
  constructor(
    message: string,

    readonly status: number,
  ) {
    super(message)

    this.name = "ApiError"
  }
}

function getErrorMessage(body: unknown, status: number): string {
  if (typeof body !== "object" || body === null) {
    return `Request failed with status ${status}.`
  }

  const message =
    "error" in body && typeof body.error === "string"
      ? body.error
      : `Request failed with status ${status}.`

  if (!("details" in body) || !Array.isArray(body.details)) return message

  const issues = body.details.flatMap((detail) => {
    if (typeof detail !== "object" || detail === null) return []

    const issue = detail as { path?: unknown; message?: unknown }
    if (
      !Array.isArray(issue.path) ||
      !issue.path.every(
        (part: unknown) =>
          typeof part === "string" || typeof part === "number",
      ) ||
      typeof issue.message !== "string"
    ) {
      return []
    }

    const path = issue.path.length ? issue.path.join(".") : "payload"
    return [`${path}: ${issue.message}`]
  })

  if (issues.length === 0) return message

  const shownIssues = issues.slice(0, 5)
  const remainingCount = issues.length - shownIssues.length
  const remaining =
    remainingCount > 0 ? ` (+${remainingCount} more validation errors)` : ""

  return `${message} ${shownIssues.join("; ")}${remaining}`
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)

  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json")

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,

    headers,

    credentials: "include",
  })

  if (response.status === 204) return undefined as T

  const body: unknown = await response.json()

  if (!response.ok) {
    throw new ApiError(getErrorMessage(body, response.status), response.status)
  }

  return body as T
}
