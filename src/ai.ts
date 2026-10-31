import { apiRequest } from "./api"

const API_BASE_URL = import.meta.env.VITE_API_URL ?? ""

export interface AiCitation {
  reference: string
  documentId: string
  fileName: string
  pageNumber: number | null
}

export interface AiConversation {
  id: string
  courseCode: string | null
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface AiMessage {
  id: string
  role: "user" | "assistant"
  content: string
  status: "streaming" | "complete" | "failed"
  citations: AiCitation[] | null
  createdAt: string
}

export interface AiDocument {
  id: string
  fileId: string
  courseCode: string
  fileName: string
  sizeBytes: number
  status: "queued" | "processing" | "ready" | "failed"
  processingError: string | null
  processedChunks: number
  totalChunks: number
  createdAt: string
  updatedAt: string
}

export async function sendAiMessage(
  input: { conversationId: string; content?: string; regenerate?: boolean },
  onDelta: (text: string) => void,
): Promise<{ messageId: string; citations: AiCitation[] }> {
  const response = await fetch(`${API_BASE_URL}/api/ai/chat/message`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `AI request failed with status ${response.status}.`
    throw new Error(message)
  }
  if (!response.body) throw new Error("The AI stream is unavailable.")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let eventName = ""
  let eventData = ""
  let result: { messageId: string; citations: AiCitation[] } | null = null

  function dispatch(): { messageId: string; citations: AiCitation[] } | undefined {
    if (!eventData) return
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(eventData) as Record<string, unknown>
    } catch {
      throw new Error("The AI server returned an invalid stream event.")
    }
    let completed:
      | { messageId: string; citations: AiCitation[] }
      | undefined
    if (eventName === "delta" && typeof payload.text === "string") {
      onDelta(payload.text)
    } else if (eventName === "done") {
      completed = {
        messageId: String(payload.messageId ?? ""),
        citations: Array.isArray(payload.citations)
          ? (payload.citations as AiCitation[])
          : [],
      }
    } else if (eventName === "error") {
      throw new Error(
        typeof payload.error === "string" ? payload.error : "The AI response failed.",
      )
    }
    eventName = ""
    eventData = ""
    return completed
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (line === "") {
          result = dispatch() ?? result
        } else if (line.startsWith("event:")) {
          eventName = line.slice(6).trim()
        } else if (line.startsWith("data:")) {
          eventData = line.slice(5).trim()
        }
      }
      if (done) break
    }
    if (buffer.trim()) {
      if (buffer.startsWith("data:")) eventData = buffer.slice(5).trim()
      result = dispatch() ?? result
    }
  } finally {
    reader.releaseLock()
  }
  if (!result?.messageId) {
    throw new Error("The AI response ended before it was saved.")
  }
  return result
}

export function getAi<T>(path: string) {
  return apiRequest<T>(`/api/ai${path}`)
}

export function postAi<T>(path: string, body: unknown) {
  return apiRequest<T>(`/api/ai${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function patchAi<T>(path: string, body: unknown) {
  return apiRequest<T>(`/api/ai${path}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export function deleteAi(path: string) {
  return apiRequest<void>(`/api/ai${path}`, { method: "DELETE" })
}
