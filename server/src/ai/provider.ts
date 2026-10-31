import { env } from "../env.js";

export type AiRole = "system" | "user" | "assistant";
export type AiMessageInput = { role: AiRole; content: string };
export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiGeneration {
  text: string;
  usage: AiUsage;
  model: string;
}

export interface AiStreamPart {
  text?: string;
  usage?: AiUsage;
}

export const EMBEDDING_DIMENSIONS = 768;

const requestTimeoutMs = 90_000;

export function getProviderName() {
  return env.AI_PROVIDER;
}

export function getChatModel() {
  return env.AI_PROVIDER === "gemini"
    ? env.AI_GEMINI_MODEL
    : env.AI_OPENAI_MODEL;
}

function getApiKey() {
  const key =
    env.AI_PROVIDER === "gemini" ? env.GEMINI_API_KEY : env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      `${env.AI_PROVIDER === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} is not configured on the server.`,
    );
  }
  return key;
}

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function parseUsage(value: unknown): AiUsage {
  if (!value || typeof value !== "object") {
    return { inputTokens: 0, outputTokens: 0 };
  }
  const usage = value as Record<string, unknown>;
  return {
    inputTokens: tokenCount(usage.promptTokenCount ?? usage.prompt_tokens),
    outputTokens: tokenCount(
      usage.candidatesTokenCount ?? usage.completion_tokens,
    ),
  };
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function requestSignal(parent?: AbortSignal) {
  const timeout = AbortSignal.timeout(requestTimeoutMs);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

async function providerResponse(
  path: string,
  body: unknown,
  signal?: AbortSignal,
) {
  const key = getApiKey();
  const url =
    env.AI_PROVIDER === "gemini"
      ? new URL(`https://generativelanguage.googleapis.com/v1beta/${path}`)
      : new URL(`https://api.openai.com/v1/${path}`);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.AI_PROVIDER === "gemini") url.searchParams.set("key", key);
  else headers.Authorization = `Bearer ${key}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: requestSignal(signal),
  });
  if (!response.ok) {
    console.error(
      `AI provider request failed (${env.AI_PROVIDER}, ${response.status}).`,
    );
    throw new Error(
      response.status === 429
        ? "The AI provider is rate-limiting requests. Please try again shortly."
        : "The AI provider could not complete the request. Check server configuration and try again.",
    );
  }
  return response;
}

function geminiContents(messages: AiMessageInput[]) {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
  return { system, contents };
}

export async function generateText(
  messages: AiMessageInput[],
  options: { json?: boolean; signal?: AbortSignal } = {},
): Promise<AiGeneration> {
  const model = getChatModel();
  const fullPrompt = messages.map((message) => message.content).join("\n");
  const response =
    env.AI_PROVIDER === "gemini"
      ? await providerResponse(
          `models/${model}:generateContent`,
          {
            ...geminiContents(messages),
            generationConfig: {
              temperature: 0.3,
              ...(options.json ? { responseMimeType: "application/json" } : {}),
            },
          },
          options.signal,
        )
      : await providerResponse(
          "chat/completions",
          {
            model,
            messages,
            temperature: 0.3,
            ...(options.json ? { response_format: { type: "json_object" } } : {}),
          },
          options.signal,
        );

  const body: unknown = await response.json();
  if (!body || typeof body !== "object") {
    throw new Error("The AI provider returned an invalid response.");
  }
  const data = body as Record<string, unknown>;
  const text =
    env.AI_PROVIDER === "gemini"
      ? (() => {
          const candidates = data.candidates as
            | { content?: { parts?: { text?: string }[] } }[]
            | undefined;
          return (
            candidates?.[0]?.content?.parts
              ?.map((part) => part.text ?? "")
              .join("") ?? ""
          );
        })()
      : (() => {
          const choices = data.choices as
            | { message?: { content?: string | { text?: string }[] } }[]
            | undefined;
          const content = choices?.[0]?.message?.content;
          return typeof content === "string"
            ? content
            : content?.map((part) => part.text ?? "").join("") ?? "";
        })();
  if (!text.trim()) throw new Error("The AI provider returned an empty answer.");
  const usage = parseUsage(data.usageMetadata ?? data.usage);
  if (!usage.inputTokens) usage.inputTokens = estimateTokens(fullPrompt);
  if (!usage.outputTokens) usage.outputTokens = estimateTokens(text);
  return {
    text,
    model,
    usage,
  };
}

export async function* streamText(
  messages: AiMessageInput[],
  signal?: AbortSignal,
): AsyncGenerator<AiStreamPart> {
  const model = getChatModel();
  const response =
    env.AI_PROVIDER === "gemini"
      ? await providerResponse(
          `models/${model}:streamGenerateContent?alt=sse`,
          {
            ...geminiContents(messages),
            generationConfig: { temperature: 0.3 },
          },
          signal,
        )
      : await providerResponse(
          "chat/completions",
          { model, messages, temperature: 0.3, stream: true, stream_options: { include_usage: true } },
          signal,
        );
  if (!response.body) throw new Error("The AI provider did not return a stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalUsage: AiUsage | undefined;
  let streamedText = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const content = line.slice(5).trim();
        if (!content || content === "[DONE]") continue;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(content) as Record<string, unknown>;
        } catch {
          throw new Error("The AI provider returned an invalid stream event.");
        }
        if (event.error) {
          console.error(`AI provider stream failed (${env.AI_PROVIDER}).`);
          throw new Error(
            "The AI provider could not complete the request. Check server configuration and try again.",
          );
        }
        const usage = parseUsage(event.usageMetadata ?? event.usage);
        if (usage.inputTokens || usage.outputTokens) finalUsage = usage;
        if (env.AI_PROVIDER === "gemini") {
          const candidates = event.candidates as
            | { content?: { parts?: { text?: string }[] } }[]
            | undefined;
          const text =
            candidates?.[0]?.content?.parts
              ?.map((part) => part.text ?? "")
              .join("") ?? "";
          if (text) {
            streamedText += text;
            yield { text };
          }
        } else {
          const choices = event.choices as
            | { delta?: { content?: string | { text?: string }[] } }[]
            | undefined;
          const delta = choices?.[0]?.delta?.content;
          const text =
            typeof delta === "string"
              ? delta
              : delta?.map((part) => part.text ?? "").join("") ?? "";
          if (text) {
            streamedText += text;
            yield { text };
          }
        }
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (!streamedText.trim()) {
    throw new Error("The AI provider returned an empty answer.");
  }
  yield {
    usage: finalUsage ?? {
      inputTokens: Math.ceil(messages.reduce((sum, item) => sum + item.content.length, 0) / 4),
      outputTokens: Math.ceil(streamedText.length / 4),
    },
  };
}

export async function embedTexts(
  texts: string[],
  task: EmbeddingTask,
): Promise<{ embeddings: number[][]; usage: AiUsage; model: string }> {
  if (texts.length === 0) {
    return {
      embeddings: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      model: "",
    };
  }
  const model =
    env.AI_PROVIDER === "gemini"
      ? "gemini-embedding-001"
      : "text-embedding-3-small";
  const response =
    env.AI_PROVIDER === "gemini"
      ? await providerResponse(`models/${model}:batchEmbedContents`, {
          requests: texts.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            taskType: task,
            outputDimensionality: EMBEDDING_DIMENSIONS,
          })),
        })
      : await providerResponse("embeddings", {
          model,
          input: texts,
          dimensions: EMBEDDING_DIMENSIONS,
          encoding_format: "float",
        });
  const body = (await response.json()) as Record<string, unknown>;
  const raw =
    env.AI_PROVIDER === "gemini"
      ? (body.embeddings as { values?: number[] }[] | undefined)?.map(
          (item) => item.values,
        )
      : (body.data as { index: number; embedding: number[] }[] | undefined)
          ?.sort((a, b) => a.index - b.index)
          .map((item) => item.embedding);
  if (!raw || raw.length !== texts.length) {
    throw new Error("The AI provider returned an invalid embedding response.");
  }
  const embeddings = raw.map((vector) => {
    if (
      !vector ||
      vector.length !== EMBEDDING_DIMENSIONS ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new Error("The AI provider returned an incompatible embedding.");
    }
    return vector;
  });
  const usage = parseUsage(body.usageMetadata ?? body.usage);
  if (!usage.inputTokens) {
    usage.inputTokens = Math.ceil(texts.reduce((sum, text) => sum + text.length, 0) / 4);
  }
  return { embeddings, usage, model };
}
