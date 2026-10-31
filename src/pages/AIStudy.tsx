import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { apiRequest } from "../api"
import {
  AiCitation,
  AiConversation,
  AiDocument,
  AiMessage,
  deleteAi,
  getAi,
  patchAi,
  postAi,
  sendAiMessage,
} from "../ai"
import { uploadStudentFile } from "../files"
import { COURSES } from "../data"
import { AppState, Note } from "../types"

interface Props {
  state: AppState
  update: (patch: Partial<AppState>) => void
}

type View = "chat" | "documents" | "tools"
type Tool = "summarize" | "flashcards" | "quiz" | "explain" | "exam"

const viewLabels: Record<View, string> = {
  chat: "CHAT",
  documents: "DOCUMENTS",
  tools: "STUDY TOOLS",
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function Markdown({ children }: { children: string }) {
  return (
    <div className="ai-markdown text-sm leading-7 text-[#cdd5df]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

function CitationList({ citations }: { citations: AiCitation[] | null }) {
  if (!citations?.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#19222e] pt-2">
      {citations.map((citation) => (
        <span
          key={`${citation.reference}-${citation.documentId}`}
          className="font-mono text-[9px] text-blue-300 border border-blue-900/70 bg-blue-950/30 px-2 py-1"
          title={citation.fileName}
        >
          [{citation.reference}] {citation.fileName}
          {citation.pageNumber ? ` · p.${citation.pageNumber}` : ""}
        </span>
      ))}
    </div>
  )
}

function StatusTag({ status }: { status: AiDocument["status"] }) {
  const styles: Record<AiDocument["status"], string> = {
    queued: "border-amber-900 text-amber-400",
    processing: "border-blue-900 text-blue-300",
    ready: "border-green-900 text-green-400",
    failed: "border-red-900 text-red-400",
  }
  return (
    <span className={`font-mono text-[9px] border px-1.5 py-0.5 ${styles[status]}`}>
      {status.toUpperCase()}
    </span>
  )
}

export default function AIStudy({ state, update }: Props) {
  const [view, setView] = useState<View>("chat")
  const [courseCode, setCourseCode] = useState(COURSES[0]?.code ?? "")
  const [conversations, setConversations] = useState<AiConversation[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [documents, setDocuments] = useState<AiDocument[]>([])
  const [input, setInput] = useState("")
  const [chatBusy, setChatBusy] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [uploading, setUploading] = useState(false)
  const [tool, setTool] = useState<Tool>("summarize")
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [toolBusy, setToolBusy] = useState(false)
  const [toolError, setToolError] = useState<string | null>(null)
  const [toolResult, setToolResult] = useState("")
  const [summaryStyle, setSummaryStyle] = useState<"short" | "detailed" | "exam">("short")
  const [summaryDocumentId, setSummaryDocumentId] = useState("")
  const [summaryText, setSummaryText] = useState("")
  const [loadingSummaryText, setLoadingSummaryText] = useState(false)
  const [flashcardCount, setFlashcardCount] = useState(12)
  const [flashcardCollections, setFlashcardCollections] = useState<
    {
      id: string
      title: string
      courseCode: string
      cards: { id: string; question: string; answer: string; known: boolean }[]
    }[]
  >([])
  const [activeCollectionId, setActiveCollectionId] = useState("")
  const [flashcardIndex, setFlashcardIndex] = useState(0)
  const [flashcardFlipped, setFlashcardFlipped] = useState(false)
  const [quizCount, setQuizCount] = useState(10)
  const [quizDifficulty, setQuizDifficulty] = useState<"easy" | "medium" | "hard">("medium")
  const [quiz, setQuiz] = useState<{
    id: string
    title: string
    questions: {
      type: "mcq" | "short_answer"
      question: string
      options?: string[]
    }[]
  } | null>(null)
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({})
  const [quizResult, setQuizResult] = useState<{
    score: number
    total: number
    results: {
      index: number
      correct: boolean
      answer: string
      correctAnswer: string
      explanation: string
      feedback?: string
    }[]
  } | null>(null)
  const [explainTopic, setExplainTopic] = useState("")
  const [explainLevel, setExplainLevel] = useState<"beginner" | "high-school" | "university">("beginner")
  const [assignmentId, setAssignmentId] = useState("")
  const [selectedExamId, setSelectedExamId] = useState("")
  const [quizHistory, setQuizHistory] = useState<
    { id: string; courseCode: string; title: string; difficulty: string; score: number; total: number; completedAt: string | null }[]
  >([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const courses = useMemo(() => {
    const codes = new Set([
      ...COURSES.map((course) => course.code),
      ...state.timetable.map((item) => item.courseCode),
      ...state.attendance.map((item) => item.courseCode),
      ...state.assignments.map((item) => item.courseCode),
      ...state.exams.map((item) => item.courseCode),
      ...state.notes.map((item) => item.courseCode),
    ])
    return [...codes].map((code) => ({
      code,
      name: COURSES.find((course) => course.code === code)?.name ?? code,
    }))
  }, [state])

  const readyDocuments = documents.filter(
    (document) => document.courseCode === courseCode && document.status === "ready",
  )
  const courseAssignments = state.assignments.filter(
    (assignment) => assignment.courseCode === courseCode && !assignment.completed,
  )
  const upcomingExams = state.exams
    .filter(
      (exam) =>
        exam.courseCode === courseCode &&
        new Date(`${exam.date}T00:00:00`).getTime() >= new Date().setHours(0, 0, 0, 0),
    )
    .sort((a, b) => a.date.localeCompare(b.date))

  const refreshDocuments = useCallback(async () => {
    const result = await getAi<{ documents: AiDocument[] }>("/documents")
    setDocuments(result.documents)
  }, [])

  const refreshConversations = useCallback(async () => {
    const query = courseCode ? `?courseCode=${encodeURIComponent(courseCode)}` : ""
    const result = await getAi<{ conversations: AiConversation[] }>(`/conversations${query}`)
    setConversations(result.conversations)
  }, [courseCode])

  const refreshTools = useCallback(async () => {
    const [cards, quizzes] = await Promise.all([
      getAi<{ collections: typeof flashcardCollections }>("/flashcards"),
      getAi<{ quizzes: typeof quizHistory }>("/quizzes"),
    ])
    setFlashcardCollections(cards.collections)
    setQuizHistory(quizzes.quizzes)
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([refreshDocuments(), refreshConversations(), refreshTools()])
      .then(() => {
        if (active) setPageError(null)
      })
      .catch((error: unknown) => {
        if (active) {
          setPageError(error instanceof Error ? error.message : "Could not load AI study data.")
        }
      })
    return () => {
      active = false
    }
  }, [refreshDocuments, refreshConversations, refreshTools])

  useEffect(() => {
    if (!documents.some((document) => ["queued", "processing"].includes(document.status))) return
    const timer = window.setInterval(() => {
      void refreshDocuments().catch((error: unknown) => {
        setPageError(error instanceof Error ? error.message : "Could not refresh document status.")
      })
    }, 2500)
    return () => window.clearInterval(timer)
  }, [documents, refreshDocuments])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function selectConversation(id: string) {
    setConversationId(id)
    setMobileConversationsOpen(false)
    setLoadingMessages(true)
    setPageError(null)
    try {
      const result = await getAi<{ messages: AiMessage[] }>(`/conversations/${id}`)
      setMessages(result.messages)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not load conversation.")
    } finally {
      setLoadingMessages(false)
    }
  }

  async function createConversation() {
    setPageError(null)
    try {
      const result = await postAi<{ conversation: AiConversation }>("/conversations", {
        courseCode,
      })
      await refreshConversations()
      setConversationId(result.conversation.id)
      setMessages([])
      setView("chat")
      setMobileConversationsOpen(false)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not create conversation.")
    }
  }

  async function renameConversation(id: string) {
    const title = renameValue.trim()
    if (!title) return
    try {
      await patchAi(`/conversations/${id}`, { title })
      setRenamingId(null)
      await refreshConversations()
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not rename conversation.")
    }
  }

  async function removeConversation(id: string) {
    if (!window.confirm("Delete this conversation and its messages?")) return
    try {
      await deleteAi(`/conversations/${id}`)
      if (conversationId === id) {
        setConversationId(null)
        setMessages([])
      }
      await refreshConversations()
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not delete conversation.")
    }
  }

  async function sendMessage(regenerate = false, overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if (chatBusy || (!regenerate && !text)) return
    setChatBusy(true)
    setPageError(null)
    setInput("")
    try {
      let activeId = conversationId
      if (!activeId) {
        const created = await postAi<{ conversation: AiConversation }>("/conversations", {
          courseCode,
        })
        activeId = created.conversation.id
        setConversationId(activeId)
        await refreshConversations()
      }

      const userMessage: AiMessage | null = regenerate
        ? null
        : {
            id: `local-user-${crypto.randomUUID()}`,
            role: "user",
            content: text,
            status: "complete",
            citations: null,
            createdAt: new Date().toISOString(),
          }
      const assistantId = `local-assistant-${crypto.randomUUID()}`
      setMessages((existing) => {
        const lastAssistantIndex = existing.reduce(
          (last, message, index) => message.role === "assistant" ? index : last,
          -1,
        )
        const base = regenerate && lastAssistantIndex >= 0
          ? existing.slice(0, lastAssistantIndex)
          : existing
        return [
          ...base,
          ...(userMessage ? [userMessage] : []),
          {
            id: assistantId,
            role: "assistant",
            content: "",
            status: "streaming",
            citations: null,
            createdAt: new Date().toISOString(),
          },
        ]
      })

      const result = await sendAiMessage(
        {
          conversationId: activeId,
          ...(regenerate ? { regenerate: true } : { content: text }),
        },
        (delta) => {
          setMessages((existing) =>
            existing.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + delta }
                : message,
            ),
          )
        },
      )
      setMessages((existing) =>
        existing.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                id: result.messageId,
                status: "complete",
                citations: result.citations,
              }
            : message,
        ),
      )
      await refreshConversations()
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "The AI response failed.")
      setMessages((existing) =>
        existing.map((message) =>
          message.status === "streaming" ? { ...message, status: "failed" } : message,
        ),
      )
    } finally {
      setChatBusy(false)
    }
  }

  async function uploadDocument(file?: File) {
    if (!file || uploading) return
    const extension = file.name.split(".").pop()?.toLowerCase()
    if (!["pdf", "docx", "txt"].includes(extension ?? "")) {
      setPageError("Choose a PDF, DOCX, or TXT document.")
      return
    }
    setUploading(true)
    setPageError(null)
    try {
      const uploaded = await uploadStudentFile(file, "study-document")
      try {
        await postAi("/documents/upload", {
          fileId: uploaded.id,
          courseCode,
        })
      } catch (error) {
        try {
          await apiRequest<void>(`/api/files/${uploaded.id}`, { method: "DELETE" })
        } catch (cleanupError) {
          console.error("Could not clean up an unregistered AI document:", cleanupError)
        }
        throw error
      }
      await refreshDocuments()
      setView("documents")
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Document upload failed.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function retryDocument(document: AiDocument) {
    try {
      await postAi(`/documents/${document.id}/retry`, {})
      await refreshDocuments()
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not retry processing.")
    }
  }

  async function deleteDocument(document: AiDocument) {
    if (!window.confirm(`Delete "${document.fileName}" and its indexed content?`)) return
    try {
      await deleteAi(`/documents/${document.id}`)
      setDocuments((current) => current.filter((item) => item.id !== document.id))
      setSelectedDocumentIds((current) => current.filter((id) => id !== document.id))
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not delete document.")
    }
  }

  function toggleDocument(id: string) {
    setSelectedDocumentIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  async function runTool<T = Record<string, unknown>>(path: string, body: unknown): Promise<T | null> {
    setToolBusy(true)
    setToolError(null)
    setToolResult("")
    try {
      const result = await postAi<T>(path, body)
      return result
    } catch (error) {
      setToolError(error instanceof Error ? error.message : "The study tool failed.")
      return null
    } finally {
      setToolBusy(false)
    }
  }

  async function generateSummary() {
    const result = await runTool("/tools/summarize", {
      courseCode,
      ...(summaryDocumentId ? { documentId: summaryDocumentId } : {}),
      ...(summaryText.trim() ? { selectedText: summaryText } : {}),
      style: summaryStyle,
    })
    if (result && typeof result.summary === "string") setToolResult(result.summary)
  }

  async function selectSummaryDocument(id: string) {
    setSummaryDocumentId(id)
    setSummaryText("")
    if (!id) return
    setLoadingSummaryText(true)
    setToolError(null)
    try {
      const result = await getAi<{ text: string }>(`/documents/${id}/text`)
      setSummaryText(result.text)
    } catch (error) {
      setToolError(error instanceof Error ? error.message : "Could not load document text.")
    } finally {
      setLoadingSummaryText(false)
    }
  }

  async function saveSummaryAsNote() {
    if (!toolResult.trim()) return
    const note: Note = {
      id: crypto.randomUUID(),
      courseCode,
      title: `AI Summary · ${courseCode}`,
      description: toolResult,
      date: new Date().toISOString().slice(0, 10),
      pinned: false,
    }
    update({ notes: [note, ...state.notes] })
    setToolError(null)
  }

  async function generateFlashcards() {
    const result = await runTool<{
      collection: {
        id: string
        title: string
        courseCode: string
        cards: { id: string; question: string; answer: string; known: boolean }[]
      }
    }>("/tools/flashcards", {
      courseCode,
      documentIds: selectedDocumentIds,
      count: flashcardCount,
    })
    if (result?.collection) {
      setFlashcardCollections((current) => [
        result.collection,
        ...current.filter((item) => item.id !== result.collection.id),
      ])
      setActiveCollectionId(result.collection.id)
      setFlashcardIndex(0)
      setFlashcardFlipped(false)
      await refreshTools()
    }
  }

  async function generateQuiz() {
    const result = await runTool<{
      quiz: NonNullable<typeof quiz>
    }>("/tools/quiz", {
      courseCode,
      documentIds: selectedDocumentIds,
      count: quizCount,
      difficulty: quizDifficulty,
    })
    if (result && result.quiz && typeof result.quiz === "object") {
      const next = result.quiz as NonNullable<typeof quiz>
      setQuiz(next)
      setQuizAnswers({})
      setQuizResult(null)
      await refreshTools()
    }
  }

  async function submitQuiz() {
    if (!quiz) return
    const result = await runTool<NonNullable<typeof quizResult>>(`/quizzes/${quiz.id}/submit`, { answers: quizAnswers })
    if (result && typeof result.score === "number") {
      setQuizResult(result)
      await refreshTools()
    }
  }

  const activeCollection = flashcardCollections.find(
    (collection) => collection.id === activeCollectionId,
  )
  const activeCard = activeCollection?.cards[flashcardIndex]

  async function markFlashcardKnown(known: boolean) {
    if (!activeCard) return
    try {
      await patchAi(`/flashcards/${activeCard.id}`, { known })
      setFlashcardCollections((current) =>
        current.map((collection) =>
          collection.id !== activeCollection?.id
            ? collection
            : {
                ...collection,
                cards: collection.cards.map((card) =>
                  card.id === activeCard.id ? { ...card, known } : card,
                ),
              },
        ),
      )
      setFlashcardFlipped(false)
      setFlashcardIndex((index) =>
        index + 1 >= (activeCollection?.cards.length ?? 0) ? 0 : index + 1,
      )
    } catch (error) {
      setToolError(error instanceof Error ? error.message : "Could not save card progress.")
    }
  }

  async function explainCurrentTopic() {
    const result = await runTool("/tools/explain", {
      courseCode,
      topic: explainTopic,
      ...(assignmentId ? { assignmentId } : {}),
      level: explainLevel,
    })
    if (result && typeof result.explanation === "string") setToolResult(result.explanation)
  }

  async function makeExamPlan() {
    const result = await runTool("/tools/exam-prep", {
      courseCode,
      ...(selectedExamId ? { examId: selectedExamId } : {}),
    })
    if (result && typeof result.plan === "string") setToolResult(result.plan)
  }

  const selectedTabClass = (active: boolean) =>
    `px-3 py-2 font-mono text-[10px] border-b-2 transition-colors ${
      active
        ? "border-amber-400 text-amber-400"
        : "border-transparent text-[#4e5e72] hover:text-[#cdd5df]"
    }`

  return (
    <div className="min-h-full bg-[#080b0f] p-3 sm:p-5 lg:p-6">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.24em] text-amber-400">
              STUDENT/OS · LEARNING INTELLIGENCE
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[#e2e8f0]">
              AI Study Assistant
            </h2>
          </div>
          <label className="flex items-center gap-2 font-mono text-[10px] text-[#4e5e72]">
            COURSE
            <select
              value={courseCode}
              onChange={(event) => {
                setCourseCode(event.target.value)
                setConversationId(null)
                setMessages([])
                setSelectedDocumentIds([])
              }}
              className="max-w-48 px-2 py-2 text-xs text-[#cdd5df]"
            >
              {courses.map((course) => (
                <option key={course.code} value={course.code}>
                  {course.code} — {course.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {pageError && (
          <div role="alert" className="mb-3 flex items-start justify-between gap-3 border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            <span>{pageError}</span>
            <button onClick={() => setPageError(null)} className="font-mono text-[10px]">DISMISS</button>
          </div>
        )}

        <div className="overflow-hidden border border-[#19222e] bg-[#0d1219]">
          <div className="flex items-center justify-between border-b border-[#19222e] px-3 sm:px-4">
            <div className="flex">
              {(Object.keys(viewLabels) as View[]).map((item) => (
                <button key={item} onClick={() => setView(item)} className={selectedTabClass(view === item)}>
                  {viewLabels[item]}
                  {item === "documents" && documents.length > 0 && (
                    <span className="ml-1.5 text-[9px] text-[#7a8494]">{documents.length}</span>
                  )}
                </button>
              ))}
            </div>
            {view === "chat" && (
              <button
                onClick={() => setMobileConversationsOpen((open) => !open)}
                className="rounded border border-[#263244] px-2 py-1 font-mono text-[9px] text-[#cdd5df] lg:hidden"
              >
                {mobileConversationsOpen ? "CLOSE HISTORY" : "HISTORY"}
              </button>
            )}
          </div>

          {view === "chat" && (
            <div className="grid min-h-[620px] lg:grid-cols-[270px_minmax(0,1fr)]">
              <aside className={`${mobileConversationsOpen ? "block" : "hidden"} border-b border-[#19222e] bg-[#0a0e14] lg:block lg:border-b-0 lg:border-r`}>
                <div className="flex items-center justify-between border-b border-[#19222e] px-3 py-3">
                  <span className="font-mono text-[9px] tracking-widest text-[#4e5e72]">CONVERSATIONS</span>
                  <button onClick={() => void createConversation()} className="font-mono text-[10px] text-amber-400 hover:text-amber-300">+ NEW</button>
                </div>
                <div className="max-h-64 overflow-y-auto p-2 lg:max-h-[590px]">
                  {conversations.length === 0 ? (
                    <p className="px-2 py-6 text-center font-mono text-[10px] leading-5 text-[#4e5e72]">
                      Start a conversation to build your course study history.
                    </p>
                  ) : conversations.map((item) => (
                    <div key={item.id} className={`mb-1 border px-2 py-2 ${conversationId === item.id ? "border-amber-900 bg-amber-950/20" : "border-transparent hover:bg-[#111720]"}`}>
                      {renamingId === item.id ? (
                        <form onSubmit={(event) => { event.preventDefault(); void renameConversation(item.id) }} className="flex gap-1">
                          <input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} className="min-w-0 flex-1 px-1 py-1 text-xs" />
                          <button className="font-mono text-[9px] text-amber-400">SAVE</button>
                        </form>
                      ) : (
                        <div className="flex items-start gap-1">
                          <button onClick={() => void selectConversation(item.id)} className="min-w-0 flex-1 text-left">
                            <span className={`block truncate text-xs ${conversationId === item.id ? "text-amber-300" : "text-[#cdd5df]"}`}>{item.title}</span>
                            <span className="mt-1 block font-mono text-[9px] text-[#4e5e72]">{item.courseCode ?? "ALL COURSES"} · {item.messageCount} messages</span>
                          </button>
                          <button title="Rename" onClick={() => { setRenamingId(item.id); setRenameValue(item.title) }} className="px-1 font-mono text-[9px] text-[#4e5e72] hover:text-amber-400">EDIT</button>
                          <button title="Delete" onClick={() => void removeConversation(item.id)} className="px-1 font-mono text-[9px] text-[#4e5e72] hover:text-red-400">×</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="border-t border-[#19222e] p-3">
                  <p className="font-mono text-[9px] leading-4 text-[#4e5e72]">
                    Responses can use your processed course documents and cite their source pages.
                  </p>
                </div>
              </aside>

              <section className="flex min-h-[620px] min-w-0 flex-col">
                <div className="flex items-center justify-between border-b border-[#19222e] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    <span className="font-mono text-[9px] tracking-widest text-[#7a8494]">
                      {conversationId ? "COURSE-REFERENCED SESSION" : "READY WHEN YOU ARE"}
                    </span>
                  </div>
                  <button onClick={() => setView("documents")} className="font-mono text-[9px] text-blue-300 hover:text-blue-200">
                    {readyDocuments.length} COURSE SOURCES
                  </button>
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-5">
                  {loadingMessages ? (
                    <p className="py-16 text-center font-mono text-[10px] text-[#4e5e72]">LOADING CONVERSATION...</p>
                  ) : messages.length === 0 ? (
                    <div className="mx-auto max-w-xl py-10 text-center sm:py-16">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center border border-amber-900 bg-amber-950/30 font-mono text-xl text-amber-400">✧</div>
                      <h3 className="mt-4 text-base font-semibold text-[#e2e8f0]">Study with your course materials</h3>
                      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[#7a8494]">
                        Ask for a concept explanation, compare ideas, or work through a problem. Answers distinguish cited course sources from general guidance.
                      </p>
                      <div className="mt-5 grid gap-2 text-left sm:grid-cols-2">
                        {[
                          "Explain the key ideas in my course documents.",
                          "Make a simple example to help me understand a difficult topic.",
                          "What should I revise next for this course?",
                          "Quiz me on the most important concepts.",
                        ].map((prompt) => (
                          <button key={prompt} onClick={() => void sendMessage(false, prompt)} className="border border-[#19222e] bg-[#080b0f] px-3 py-2 text-left text-xs text-[#cdd5df] transition-colors hover:border-amber-900 hover:text-amber-300">
                            {prompt}
                          </button>
                        ))}
                      </div>
                      {readyDocuments.length === 0 && (
                        <button onClick={() => setView("documents")} className="mt-5 font-mono text-[10px] text-blue-300 hover:text-blue-200">
                          UPLOAD COURSE DOCUMENTS TO ADD CITED ANSWERS →
                        </button>
                      )}
                    </div>
                  ) : messages.map((message, index) => (
                    <article key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      {message.role === "assistant" && <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border border-amber-900 bg-amber-950/30 font-mono text-xs text-amber-400">✧</div>}
                      <div className={`min-w-0 max-w-[92%] border px-3 py-3 sm:max-w-[82%] ${message.role === "user" ? "border-[#263244] bg-[#111720]" : "border-[#19222e] bg-[#0a0e14]"}`}>
                        <div className="mb-2 flex items-center justify-between gap-4">
                          <span className={`font-mono text-[9px] tracking-widest ${message.role === "user" ? "text-[#7a8494]" : "text-amber-400"}`}>
                            {message.role === "user" ? "YOU" : "STUDENT/OS"}
                          </span>
                          {message.role === "assistant" && message.content && (
                            <div className="flex gap-2">
                              <button onClick={() => void navigator.clipboard.writeText(message.content).catch((error: unknown) => setPageError(error instanceof Error ? error.message : "Clipboard access failed."))} className="font-mono text-[9px] text-[#4e5e72] hover:text-[#cdd5df]">COPY</button>
                              {index === messages.length - 1 && message.status !== "streaming" && (
                                <button disabled={chatBusy} onClick={() => void sendMessage(true)} className="font-mono text-[9px] text-[#4e5e72] hover:text-amber-300 disabled:opacity-40">REGENERATE</button>
                              )}
                            </div>
                          )}
                        </div>
                        {message.content ? <Markdown>{message.content}</Markdown> : message.status === "streaming" ? (
                          <div className="flex items-center gap-2 py-2 text-xs text-[#7a8494]">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" /> Thinking through your question...
                          </div>
                        ) : (
                          <p className="font-mono text-xs text-red-400">This response did not finish. You can try again.</p>
                        )}
                        {message.role === "assistant" && <CitationList citations={message.citations} />}
                      </div>
                      {message.role === "user" && <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border border-[#263244] font-mono text-[10px] text-[#7a8494]">YOU</div>}
                    </article>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={(event) => { event.preventDefault(); void sendMessage() }} className="border-t border-[#19222e] bg-[#0a0e14] p-3 sm:p-4">
                  <div className="flex items-end gap-2 border border-[#263244] bg-[#080b0f] p-2 focus-within:border-amber-400/60">
                    <textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault()
                          void sendMessage()
                        }
                      }}
                      rows={2}
                      maxLength={8000}
                      placeholder="Ask a question about this course..."
                      className="max-h-36 min-h-12 flex-1 resize-y border-none bg-transparent px-1 py-1 text-sm focus:outline-none"
                      disabled={chatBusy}
                    />
                    <button type="submit" disabled={chatBusy || !input.trim()} className="shrink-0 bg-amber-400 px-3 py-2 font-mono text-[10px] font-semibold text-[#090b0e] hover:bg-amber-300 disabled:bg-[#19222e] disabled:text-[#4e5e72]">
                      {chatBusy ? "..." : "SEND ↗"}
                    </button>
                  </div>
                  <p className="mt-2 text-center font-mono text-[8px] text-[#4e5e72]">
                    AI can make mistakes. Check cited material before relying on an answer.
                  </p>
                </form>
              </section>
            </div>
          )}

          {view === "documents" && (
            <section className="p-3 sm:p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-mono text-xs tracking-widest text-[#cdd5df]">COURSE LIBRARY</h3>
                  <p className="mt-1 text-xs text-[#4e5e72]">Private documents are indexed for this account and course only.</p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 border border-amber-400 px-3 py-2 font-mono text-[10px] text-amber-400 hover:bg-amber-400 hover:text-[#090b0e]">
                  {uploading ? "UPLOADING..." : "+ ADD DOCUMENT"}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="hidden"
                    disabled={uploading}
                    onChange={(event) => void uploadDocument(event.target.files?.[0])}
                  />
                </label>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  void uploadDocument(event.dataTransfer.files[0])
                }}
                className="w-full border border-dashed border-[#263244] bg-[#080b0f] px-4 py-8 text-center transition-colors hover:border-amber-400/70"
              >
                <span className="font-mono text-lg text-amber-400">↑</span>
                <span className="mt-2 block text-sm text-[#cdd5df]">Drop a document here or browse files</span>
                <span className="mt-1 block font-mono text-[9px] text-[#4e5e72]">PDF · DOCX · TXT · UP TO 20 MiB</span>
              </button>
              <div className="mt-5 space-y-2">
                {documents.filter((document) => document.courseCode === courseCode).length === 0 ? (
                  <div className="border border-[#19222e] bg-[#080b0f] px-4 py-10 text-center">
                    <p className="font-mono text-xs text-[#cdd5df]">NO DOCUMENTS FOR {courseCode}</p>
                    <p className="mt-2 text-xs text-[#4e5e72]">Upload lecture notes or course readings to use grounded chat, summaries, flashcards, and quizzes.</p>
                  </div>
                ) : documents.filter((document) => document.courseCode === courseCode).map((document) => (
                  <div key={document.id} className="border border-[#19222e] bg-[#080b0f] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 border border-[#263244] px-2 py-1 font-mono text-[9px] text-blue-300">{document.fileName.split(".").pop()?.toUpperCase()}</span>
                        <div className="min-w-0">
                          <p className="break-all text-sm text-[#cdd5df]">{document.fileName}</p>
                          <p className="mt-1 font-mono text-[9px] text-[#4e5e72]">{formatBytes(document.sizeBytes)} · UPLOADED {formatDate(document.createdAt)} · {document.courseCode}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusTag status={document.status} />
                        {document.status === "failed" && (
                          <button onClick={() => void retryDocument(document)} className="font-mono text-[9px] text-amber-400 hover:text-amber-300">RETRY</button>
                        )}
                        <button onClick={() => void deleteDocument(document)} className="font-mono text-[9px] text-[#4e5e72] hover:text-red-400">DELETE</button>
                      </div>
                    </div>
                    {["processing", "queued"].includes(document.status) && (
                      <div className="mt-3">
                        <div className="flex justify-between font-mono text-[9px] text-[#4e5e72]">
                          <span>{document.status === "queued" ? "QUEUED FOR INDEXING" : "EXTRACTING AND INDEXING"}</span>
                          <span>{document.processedChunks}/{document.totalChunks || "—"} chunks</span>
                        </div>
                        <div className="mt-1 h-1 bg-[#19222e]">
                          <div className="h-1 bg-blue-400 transition-all" style={{ width: `${document.totalChunks ? Math.min(100, (document.processedChunks / document.totalChunks) * 100) : 12}%` }} />
                        </div>
                      </div>
                    )}
                    {document.processingError && <p role="alert" className="mt-2 text-xs text-red-300">{document.processingError}</p>}
                    {document.status === "ready" && <p className="mt-2 font-mono text-[9px] text-green-400">{document.totalChunks} TEXT CHUNKS INDEXED</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {view === "tools" && (
            <section className="p-3 sm:p-5">
              <div className="mb-4">
                <h3 className="font-mono text-xs tracking-widest text-[#cdd5df]">ACTIVE LEARNING TOOLS</h3>
                <p className="mt-1 text-xs text-[#4e5e72]">Generated study materials are grounded in processed documents for {courseCode}.</p>
              </div>
              <div className="mb-4 flex flex-wrap gap-1 border-b border-[#19222e]">
                {([
                  ["summarize", "SUMMARIZER"],
                  ["flashcards", "FLASHCARDS"],
                  ["quiz", "QUIZ"],
                  ["explain", "EXPLAIN SIMPLY"],
                  ["exam", "EXAM PREP"],
                ] as [Tool, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => { setTool(key); setToolResult(""); setToolError(null) }} className={selectedTabClass(tool === key)}>{label}</button>
                ))}
              </div>

              {readyDocuments.length === 0 && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-amber-900/70 bg-amber-950/20 px-3 py-3">
                  <p className="text-xs text-amber-200">Upload and process documents for {courseCode} to use material-based tools.</p>
                  <button onClick={() => setView("documents")} className="font-mono text-[9px] text-amber-300">OPEN LIBRARY →</button>
                </div>
              )}

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
                <div className="space-y-3 border border-[#19222e] bg-[#080b0f] p-4">
                  {tool === "summarize" && (
                    <>
                      <label className="block font-mono text-[9px] text-[#4e5e72]">DOCUMENT
                        <select value={summaryDocumentId} onChange={(event) => void selectSummaryDocument(event.target.value)} className="mt-1 w-full px-2 py-2 text-xs">
                          <option value="">All processed {courseCode} documents</option>
                          {readyDocuments.map((document) => <option key={document.id} value={document.id}>{document.fileName}</option>)}
                        </select>
                      </label>
                      {summaryDocumentId && (
                        <label className="block font-mono text-[9px] text-[#4e5e72]">
                          SOURCE TEXT · EDIT OR SELECT A SECTION
                          <textarea
                            value={summaryText}
                            onChange={(event) => setSummaryText(event.target.value)}
                            rows={8}
                            maxLength={500_000}
                            disabled={loadingSummaryText}
                            className="mt-1 w-full resize-y px-2 py-2 text-xs font-sans leading-5"
                            placeholder={loadingSummaryText ? "Loading extracted text..." : "Select a document to load its extracted text."}
                          />
                        </label>
                      )}
                      <label className="block font-mono text-[9px] text-[#4e5e72]">SUMMARY STYLE
                        <select value={summaryStyle} onChange={(event) => setSummaryStyle(event.target.value as typeof summaryStyle)} className="mt-1 w-full px-2 py-2 text-xs">
                          <option value="short">Short revision brief</option>
                          <option value="detailed">Detailed summary</option>
                          <option value="exam">Exam-focused notes</option>
                        </select>
                      </label>
                      <button disabled={toolBusy || loadingSummaryText || (readyDocuments.length === 0 && !summaryText.trim())} onClick={() => void generateSummary()} className="w-full bg-amber-400 px-3 py-2 font-mono text-[10px] font-semibold text-[#090b0e] hover:bg-amber-300 disabled:opacity-40">{toolBusy ? "SUMMARIZING..." : "GENERATE SUMMARY"}</button>
                    </>
                  )}

                  {tool === "flashcards" && (
                    <>
                      <label className="block font-mono text-[9px] text-[#4e5e72]">NUMBER OF CARDS
                        <input type="number" min={4} max={30} value={flashcardCount} onChange={(event) => setFlashcardCount(Number(event.target.value))} className="mt-1 w-full px-2 py-2 text-xs" />
                      </label>
                      <div className="space-y-1">
                        {readyDocuments.map((document) => (
                          <label key={document.id} className="flex items-center gap-2 border border-[#19222e] px-2 py-2 text-xs text-[#cdd5df]">
                            <input type="checkbox" checked={selectedDocumentIds.includes(document.id)} onChange={() => toggleDocument(document.id)} />
                            <span className="truncate">{document.fileName}</span>
                          </label>
                        ))}
                      </div>
                      <button disabled={toolBusy || readyDocuments.length === 0} onClick={() => void generateFlashcards()} className="w-full bg-amber-400 px-3 py-2 font-mono text-[10px] font-semibold text-[#090b0e] hover:bg-amber-300 disabled:opacity-40">{toolBusy ? "CREATING..." : "GENERATE & SAVE CARDS"}</button>
                    </>
                  )}

                  {tool === "quiz" && (
                    <>
                      <label className="block font-mono text-[9px] text-[#4e5e72]">QUESTION COUNT
                        <input type="number" min={4} max={20} value={quizCount} onChange={(event) => setQuizCount(Number(event.target.value))} className="mt-1 w-full px-2 py-2 text-xs" />
                      </label>
                      <label className="block font-mono text-[9px] text-[#4e5e72]">DIFFICULTY
                        <select value={quizDifficulty} onChange={(event) => setQuizDifficulty(event.target.value as typeof quizDifficulty)} className="mt-1 w-full px-2 py-2 text-xs">
                          <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                        </select>
                      </label>
                      <button disabled={toolBusy || readyDocuments.length === 0} onClick={() => void generateQuiz()} className="w-full bg-amber-400 px-3 py-2 font-mono text-[10px] font-semibold text-[#090b0e] hover:bg-amber-300 disabled:opacity-40">{toolBusy ? "BUILDING QUIZ..." : "GENERATE PRACTICE QUIZ"}</button>
                    </>
                  )}

                  {tool === "explain" && (
                    <>
                      <label className="block font-mono text-[9px] text-[#4e5e72]">ASSIGNMENT (OPTIONAL)
                        <select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} className="mt-1 w-full px-2 py-2 text-xs">
                          <option value="">No assignment selected</option>
                          {courseAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}
                        </select>
                      </label>
                      <label className="block font-mono text-[9px] text-[#4e5e72]">TOPIC OR QUESTION
                        <textarea value={explainTopic} onChange={(event) => setExplainTopic(event.target.value)} rows={4} maxLength={2000} className="mt-1 w-full resize-y px-2 py-2 text-xs" placeholder="What concept should I explain?" />
                      </label>
                      <label className="block font-mono text-[9px] text-[#4e5e72]">EXPLANATION LEVEL
                        <select value={explainLevel} onChange={(event) => setExplainLevel(event.target.value as typeof explainLevel)} className="mt-1 w-full px-2 py-2 text-xs">
                          <option value="beginner">Beginner</option><option value="high-school">High school</option><option value="university">University</option>
                        </select>
                      </label>
                      <button disabled={toolBusy || (!explainTopic.trim() && !assignmentId)} onClick={() => void explainCurrentTopic()} className="w-full bg-amber-400 px-3 py-2 font-mono text-[10px] font-semibold text-[#090b0e] hover:bg-amber-300 disabled:opacity-40">{toolBusy ? "EXPLAINING..." : "EXPLAIN THIS"}</button>
                    </>
                  )}

                  {tool === "exam" && (
                    <>
                      <label className="block font-mono text-[9px] text-[#4e5e72]">UPCOMING EXAM
                        <select value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)} className="mt-1 w-full px-2 py-2 text-xs">
                          <option value="">Use next exam for this course</option>
                          {upcomingExams.map((exam) => <option key={exam.id} value={exam.id}>{exam.type} · {exam.date}</option>)}
                        </select>
                      </label>
                      <p className="text-xs leading-5 text-[#7a8494]">Builds a plan from the selected exam date, your course timetable, pending assignments, and processed course documents.</p>
                      <button disabled={toolBusy} onClick={() => void makeExamPlan()} className="w-full bg-amber-400 px-3 py-2 font-mono text-[10px] font-semibold text-[#090b0e] hover:bg-amber-300 disabled:opacity-40">{toolBusy ? "PLANNING..." : "BUILD REVISION PLAN"}</button>
                    </>
                  )}

                  {toolError && <p role="alert" className="text-xs text-red-300">{toolError}</p>}
                </div>

                <div className="min-h-64 border border-[#19222e] bg-[#0a0e14] p-4">
                  {tool === "flashcards" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[9px] tracking-widest text-[#4e5e72]">SAVED DECKS</p>
                        {activeCollection && <button onClick={() => void deleteAi(`/flashcards/${activeCollection.id}`).then(() => refreshTools()).catch((error: unknown) => setToolError(error instanceof Error ? error.message : "Could not delete deck."))} className="font-mono text-[9px] text-red-400">DELETE DECK</button>}
                      </div>
                      <select value={activeCollectionId} onChange={(event) => { setActiveCollectionId(event.target.value); setFlashcardIndex(0); setFlashcardFlipped(false) }} className="w-full px-2 py-2 text-xs">
                        <option value="">Choose a saved deck</option>
                        {flashcardCollections.filter((item) => item.courseCode === courseCode).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                      </select>
                      {activeCard ? (
                        <>
                          <button onClick={() => setFlashcardFlipped((flipped) => !flipped)} className="flex min-h-44 w-full items-center justify-center border border-[#263244] bg-[#080b0f] p-5 text-center text-sm text-[#e2e8f0]">
                            <span><span className="mb-3 block font-mono text-[9px] text-amber-400">{flashcardFlipped ? "ANSWER" : "QUESTION"} · CLICK TO FLIP</span>{flashcardFlipped ? activeCard.answer : activeCard.question}</span>
                          </button>
                          <div className="flex items-center justify-between font-mono text-[9px] text-[#4e5e72]">
                            <button onClick={() => { setFlashcardIndex((index) => (index - 1 + (activeCollection?.cards.length ?? 1)) % (activeCollection?.cards.length ?? 1)); setFlashcardFlipped(false) }}>← PREVIOUS</button>
                            <span>{flashcardIndex + 1} / {activeCollection?.cards.length}</span>
                            <button onClick={() => { setFlashcardIndex((index) => (index + 1) % (activeCollection?.cards.length ?? 1)); setFlashcardFlipped(false) }}>NEXT →</button>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => void markFlashcardKnown(true)} className="flex-1 border border-green-900 py-2 font-mono text-[9px] text-green-400">I KNOW THIS</button>
                            <button onClick={() => void markFlashcardKnown(false)} className="flex-1 border border-amber-900 py-2 font-mono text-[9px] text-amber-400">REVISE AGAIN</button>
                          </div>
                          <p className="font-mono text-[9px] text-[#4e5e72]">{activeCollection?.cards.filter((card) => card.known).length} KNOWN · {activeCollection?.cards.filter((card) => !card.known).length} TO REVIEW</p>
                        </>
                      ) : <p className="py-10 text-center text-xs text-[#4e5e72]">Generate or select a deck to begin a revision session.</p>}
                    </div>
                  )}

                  {tool === "quiz" && quiz && (
                    <div>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="font-mono text-[9px] tracking-widest text-[#4e5e72]">{quiz.title} · {quiz.questions.length} QUESTIONS</p>
                        {quizResult && <span className="font-mono text-xs text-amber-400">SCORE {quizResult.score}/{quizResult.total}</span>}
                      </div>
                      <div className="max-h-[520px] space-y-4 overflow-y-auto">
                        {quiz.questions.map((question, index) => (
                          <fieldset key={`${quiz.id}-${index}`} className="border border-[#19222e] p-3">
                            <legend className="font-mono text-[9px] text-[#4e5e72]">Q{index + 1} · {question.type === "mcq" ? "MULTIPLE CHOICE" : "SHORT ANSWER"}</legend>
                            <p className="mb-2 text-xs leading-5 text-[#cdd5df]">{question.question}</p>
                            {question.options?.map((option) => (
                              <label key={option} className="mb-1 flex items-start gap-2 text-xs text-[#9aa5b5]">
                                <input type="radio" name={`question-${index}`} checked={quizAnswers[String(index)] === option} onChange={() => setQuizAnswers((answers) => ({ ...answers, [String(index)]: option }))} disabled={!!quizResult} />
                                {option}
                              </label>
                            ))}
                            {!question.options && <textarea value={quizAnswers[String(index)] ?? ""} onChange={(event) => setQuizAnswers((answers) => ({ ...answers, [String(index)]: event.target.value }))} rows={2} className="w-full px-2 py-1.5 text-xs" disabled={!!quizResult} placeholder="Write your answer..." />}
                            {quizResult && quizResult.results[index] && (
                              <p className={`mt-2 text-xs ${quizResult.results[index].correct ? "text-green-400" : "text-red-300"}`}>
                                {quizResult.results[index].correct ? "Correct" : `Review: ${quizResult.results[index].correctAnswer}`} · {quizResult.results[index].explanation}
                              </p>
                            )}
                          </fieldset>
                        ))}
                      </div>
                      {!quizResult ? (
                        <button disabled={toolBusy} onClick={() => void submitQuiz()} className="mt-3 w-full bg-amber-400 py-2 font-mono text-[10px] font-semibold text-[#090b0e] disabled:opacity-40">{toolBusy ? "GRADING..." : "SUBMIT ANSWERS"}</button>
                      ) : <button onClick={() => { setQuiz(null); setQuizResult(null); setQuizAnswers({}) }} className="mt-3 w-full border border-[#263244] py-2 font-mono text-[10px] text-[#cdd5df]">START ANOTHER QUIZ</button>}
                    </div>
                  )}

                  {tool === "quiz" && !quiz && (
                    <div>
                      <p className="font-mono text-[9px] tracking-widest text-[#4e5e72]">QUIZ HISTORY</p>
                      {quizHistory.filter((item) => item.courseCode === courseCode).length === 0 ? (
                        <p className="py-10 text-center text-xs text-[#4e5e72]">Completed quizzes will appear here.</p>
                      ) : quizHistory.filter((item) => item.courseCode === courseCode).map((item) => (
                        <div key={item.id} className="flex justify-between gap-2 border-b border-[#19222e] py-3 text-xs">
                          <span className="text-[#cdd5df]">{item.title}<span className="ml-2 font-mono text-[9px] text-[#4e5e72]">{item.difficulty}</span></span>
                          <span className="font-mono text-[#4e5e72]">{item.completedAt ? `${item.score}/${item.total}` : "NOT TAKEN"}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {tool === "summarize" && toolResult && (
                    <>
                      <div className="mb-3 flex items-center justify-between">
                        <p className="font-mono text-[9px] tracking-widest text-[#4e5e72]">GENERATED SUMMARY</p>
                        <button onClick={() => void saveSummaryAsNote()} className="font-mono text-[9px] text-amber-400 hover:text-amber-300">SAVE TO NOTES</button>
                      </div>
                      <Markdown>{toolResult}</Markdown>
                    </>
                  )}
                  {["explain", "exam"].includes(tool) && toolResult && <Markdown>{toolResult}</Markdown>}
                  {!toolResult && !(tool === "flashcards" && activeCard) && !(tool === "quiz" && quiz) && (
                    <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
                      <span className="font-mono text-2xl text-[#263244]">✧</span>
                      <p className="mt-3 font-mono text-[9px] tracking-widest text-[#4e5e72]">YOUR MATERIAL, TURNED INTO PRACTICE</p>
                      <p className="mt-1 max-w-xs text-xs leading-5 text-[#4e5e72]">Generated summaries can be saved as course notes. Flashcards and quizzes are saved for revision.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
