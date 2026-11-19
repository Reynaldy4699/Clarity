import { GEMINI_MODELS } from '../data/presets'
import type {
  ChatMessage,
  DocumentChunk,
  KnowledgeDocument,
  MessageTelemetry,
  ModelId,
  RetrievedChunk,
  ToolCallTrace,
} from '../types'
import { embedSingleQuery, retrieveRelevantChunks } from './rag'
import { executeToolCall, GEMINI_TOOL_DECLARATIONS } from './tools'

const KEY_STORAGE_NAME = 'clarity_gemini_api_key'

export function getStoredApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE_NAME) ?? ''
  } catch {
    return ''
  }
}

export function saveStoredApiKey(key: string): void {
  try {
    const trimmed = key.trim()
    if (trimmed) {
      localStorage.setItem(KEY_STORAGE_NAME, trimmed)
    } else {
      localStorage.removeItem(KEY_STORAGE_NAME)
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function resolveEffectiveApiKey(): { key: string; source: 'browser' | 'env' | 'none' } {
  const stored = getStoredApiKey().trim()
  if (stored) return { key: stored, source: 'browser' }

  const envKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? ''
  if (envKey) return { key: envKey, source: 'env' }

  return { key: '', source: 'none' }
}

export async function testGeminiConnection(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim()
  if (!key) return { ok: false, message: 'API key is empty.' }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=5&key=${encodeURIComponent(key)}`,
    )
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 120)}` }
    }
    return { ok: true, message: 'Connected to Gemini API (200 OK).' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Network error' }
  }
}

function estimateCostUsd(modelId: string, promptTokens: number, completionTokens: number): number {
  const info = GEMINI_MODELS.find((m) => m.id === modelId) ?? GEMINI_MODELS[0]
  return (
    (promptTokens / 1_000_000) * info.inputCostPer1M +
    (completionTokens / 1_000_000) * info.outputCostPer1M
  )
}

interface GeminiPart {
  text?: string
  functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
  thoughtSignature?: string
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiCandidateChunk {
  candidates?: Array<{
    content?: GeminiContent
    finishReason?: string
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

async function streamGeminiTurn(options: {
  apiKey: string
  model: ModelId
  systemInstruction: string
  contents: GeminiContent[]
  temperature: number
  toolsEnabled: boolean
  signal?: AbortSignal
  onTextDelta: (delta: string) => void
}): Promise<{
  text: string
  rawModelParts: GeminiPart[]
  functionCalls: Array<{ name: string; args: Record<string, unknown> }>
  promptTokens: number
  completionTokens: number
}> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: options.systemInstruction }] },
    contents: options.contents,
    generationConfig: {
      temperature: options.temperature,
      maxOutputTokens: 1400,
    },
  }
  if (options.toolsEnabled) {
    body.tools = GEMINI_TOOL_DECLARATIONS
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(options.apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  })

  if (!res.ok) {
    const errBody = await res.text()
    const error = new Error(`Gemini HTTP ${res.status}: ${errBody.slice(0, 180)}`)
    ;(error as Error & { status?: number }).status = res.status
    throw error
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('Streaming response body is unavailable.')

  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  const rawModelParts: GeminiPart[] = []
  const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  let promptTokens = 0
  let completionTokens = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const jsonStr = line.slice(5).trim()
      if (!jsonStr || jsonStr === '[DONE]') continue

      try {
        const parsed = JSON.parse(jsonStr) as GeminiCandidateChunk
        if (parsed.usageMetadata) {
          promptTokens = parsed.usageMetadata.promptTokenCount ?? promptTokens
          completionTokens = parsed.usageMetadata.candidatesTokenCount ?? completionTokens
        }
        const parts = parsed.candidates?.[0]?.content?.parts ?? []
        for (const part of parts) {
          rawModelParts.push(part)
          if (part.text) {
            fullText += part.text
            options.onTextDelta(part.text)
          }
          if (part.functionCall) {
            functionCalls.push({
              name: part.functionCall.name,
              args: part.functionCall.args ?? {},
            })
          }
        }
      } catch {
        // Ignore partial SSE lines until complete
      }
    }
  }

  return { text: fullText, rawModelParts, functionCalls, promptTokens, completionTokens }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runSandboxAssistant(options: {
  query: string
  citations: RetrievedChunk[]
  toolsEnabled: boolean
  documents: KnowledgeDocument[]
  chunks: DocumentChunk[]
  onTextDelta: (delta: string) => void
  signal?: AbortSignal
}): Promise<{ text: string; toolCalls: ToolCallTrace[]; promptTokens: number; completionTokens: number }> {
  const toolCalls: ToolCallTrace[] = []
  const q = options.query.trim()
  const lower = q.toLowerCase()

  // Trigger real REST API tool calls in Sandbox Mode when relevant
  if (options.toolsEnabled) {
    const ghMatch = lower.includes('github')
      ? q.match(/github(?:\.com\/|\s+(?:profile|user|account)\s+|\s+)["'@]?([a-zA-Z0-9-]{1,39})["']?/i)
      : null
    if (ghMatch?.[1]) {
      const trace = await executeToolCall(
        'fetch_github_user',
        { username: ghMatch[1] },
        { documents: options.documents, chunks: options.chunks },
      )
      toolCalls.push(trace)
    } else if (lower.includes('cost') || lower.includes('monthly') || lower.includes('estimate')) {
      const trace = await executeToolCall(
        'estimate_llm_cost',
        { modelId: 'gemini-3-flash-preview', avgInputTokens: 900, avgOutputTokens: 350, dailyRequests: 2000 },
        { documents: options.documents, chunks: options.chunks },
      )
      toolCalls.push(trace)
    } else if (lower.includes('knowledge base') || lower.includes('how many doc') || lower.includes('chunk')) {
      const trace = await executeToolCall(
        'inspect_knowledge_base',
        {},
        { documents: options.documents, chunks: options.chunks },
      )
      toolCalls.push(trace)
    }
  }

  const isGreeting =
    /^(hi|hey|hello|halo|hai|yo|hiya|good\s+(morning|afternoon|evening)|selamat\s+(pagi|siang|sore|malam))[\s!?.,]*$/i.test(
      q,
    ) ||
    /(what can you do|who are you|how do you work|what are your capabilities|help me|introduce yourself|bisa apa|siapa kamu)/i.test(
      lower,
    )

  const lines: string[] = []
  if (toolCalls.length > 0) {
    const first = toolCalls[0]
    const parsed = JSON.parse(first.result) as Record<string, unknown>
    if (first.name === 'fetch_github_user' && !parsed.error) {
      lines.push(
        `Here is the live GitHub REST API summary for **@${String(parsed.login)}** (${String(parsed.name)}):`,
        '',
        `- **Public Repositories:** ${String(parsed.publicRepos)}`,
        `- **Followers / Following:** ${String(parsed.followers)} / ${String(parsed.following)}`,
        `- **Bio:** ${String(parsed.bio)}`,
        `- **Profile:** ${String(parsed.url)}`,
      )
    } else if (first.name === 'estimate_llm_cost' && !parsed.error) {
      lines.push(
        `Estimated cost projection on **${String(parsed.model)}** ($${String(parsed.inputRatePer1M)} / 1M input, $${String(parsed.outputRatePer1M)} / 1M output):`,
        '',
        `- **Per Request:** $${String(parsed.perRequestUsd)}`,
        `- **Daily (2,000 reqs):** $${String(parsed.dailyCostUsd)}`,
        `- **Monthly (30 days):** **$${String(parsed.monthlyCostUsd)}**`,
      )
    } else if (first.name === 'inspect_knowledge_base') {
      lines.push(
        `Knowledge Base status (**${String(parsed.retrievalMode)}**):`,
        `- **Indexed Chunks:** ${String(parsed.totalChunks)}`,
        `- **Vector Embedded Chunks:** ${String(parsed.embeddedChunks)}`,
      )
    } else {
      lines.push(`Tool \`${first.name}\` returned: \`${first.result}\``)
    }
  } else if (isGreeting) {
    lines.push(
      `Hi! I'm **Clarity**, a minimalist RAG & AI agent assistant currently running in **Sandbox Mode** (${options.documents.filter((d) => d.enabled).length} docs · ${options.chunks.length} indexed chunks).`,
      '',
      'Here is what you can test right now without an API key:',
      '- **Document Q&A (BM25 RAG):** Ask about _webhook retries_, _API rate limits (120 RPM)_, _14-day refund policy_, or _RAG architecture trade-offs_.',
      '- **Live REST Tool Calling:** Try `"Look up GitHub profile Reynaldy4699"` or `"Estimate monthly cost for Gemini 3 Flash"`.',
      '- **Custom Docs & Eval:** Upload `.md`/`.txt` files in **Knowledge**, or run the 4-case benchmark in **Telemetry & Eval**.',
      '',
      '_For open-ended conversation and Gemini vector embeddings (`gemini-embedding-001`), click **Sandbox** in the top-right bar to connect a Gemini API key._',
    )
  } else if (options.citations.length > 0 && options.citations[0].score >= 0.22) {
    lines.push('Based on the retrieved knowledge base chunks:')
    lines.push('')
    options.citations.slice(0, 2).forEach((item) => {
      const snippet = item.chunk.text.replace(/^#+\s*/gm, '').trim()
      lines.push(`- **[${item.chunk.docTitle} · Chunk ${item.chunk.index}]** ${snippet}`)
    })
    lines.push('')
    lines.push('_Running in local Sandbox Mode (BM25 retrieval). Connect a Gemini API key in the top bar for live LLM synthesis._')
  } else {
    lines.push(
      'The active knowledge base documents do not contain reliable information to answer that question.',
      '',
      'Try asking about **webhook retries**, **API rate limits**, **refund policy**, **RAG trade-offs**, or connect a Gemini API key for open-ended reasoning.',
    )
  }

  const fullText = lines.join('\n')
  const words = fullText.split(/(\s+)/)
  for (const token of words) {
    if (options.signal?.aborted) break
    options.onTextDelta(token)
    await sleep(14)
  }

  const promptTokens = Math.max(40, Math.round((q.length + options.citations.reduce((s, c) => s + c.chunk.text.length, 0)) / 4))
  const completionTokens = Math.max(25, Math.round(fullText.length / 4))
  return { text: fullText, toolCalls, promptTokens, completionTokens }
}

export interface RunAssistantParams {
  history: ChatMessage[]
  userQuery: string
  model: ModelId
  systemPrompt: string
  temperature: number
  ragEnabled: boolean
  topK: number
  toolsEnabled: boolean
  forceSandbox: boolean
  documents: KnowledgeDocument[]
  chunks: DocumentChunk[]
  signal?: AbortSignal
  onToken: (accumulated: string) => void
  onCitations?: (citations: RetrievedChunk[]) => void
  onToolCalls?: (toolCalls: ToolCallTrace[]) => void
}

export async function runAssistantTurn(params: RunAssistantParams): Promise<{
  text: string
  citations: RetrievedChunk[]
  toolCalls: ToolCallTrace[]
  telemetry: MessageTelemetry
}> {
  const startedAt = performance.now()
  const { key } = resolveEffectiveApiKey()
  const useLive = Boolean(key) && !params.forceSandbox

  // Step 1: Retrieve relevant chunks (Hybrid if API key + vector embeddings exist, else BM25)
  let citations: RetrievedChunk[] = []
  if (params.ragEnabled && params.chunks.length > 0) {
    const hasChunkVectors = params.chunks.some((c) => Boolean(c.embedding?.length))
    const queryEmbedding =
      useLive && hasChunkVectors ? await embedSingleQuery(params.userQuery, key) : undefined
    citations = retrieveRelevantChunks(params.userQuery, params.chunks, params.topK, queryEmbedding)
    params.onCitations?.(citations)
  }

  // Step 2: Sandbox Mode path
  if (!useLive) {
    let accumulated = ''
    const sandbox = await runSandboxAssistant({
      query: params.userQuery,
      citations,
      toolsEnabled: params.toolsEnabled,
      documents: params.documents,
      chunks: params.chunks,
      signal: params.signal,
      onTextDelta: (delta) => {
        accumulated += delta
        params.onToken(accumulated)
      },
    })
    params.onToolCalls?.(sandbox.toolCalls)

    return {
      text: sandbox.text,
      citations,
      toolCalls: sandbox.toolCalls,
      telemetry: {
        model: 'sandbox-bm25',
        latencyMs: Math.round(performance.now() - startedAt),
        promptTokens: sandbox.promptTokens,
        completionTokens: sandbox.completionTokens,
        totalTokens: sandbox.promptTokens + sandbox.completionTokens,
        estimatedCostUsd: 0,
        mode: 'sandbox',
        retrievedCount: citations.length,
      },
    }
  }

  // Step 3: Build grounded system instruction + multi-turn history
  const contextBlock =
    citations.length > 0
      ? `\n\n---\nRETRIEVED KNOWLEDGE CONTEXT:\n${citations
          .map(
            (c) =>
              `[${c.chunk.docTitle} · Chunk ${c.chunk.index} | score=${c.score}]\n${c.chunk.text}`,
          )
          .join('\n\n')}\n---`
      : '\n\n---\nRETRIEVED KNOWLEDGE CONTEXT: None matched.\n---'

  const fullSystemPrompt = `${params.systemPrompt}${contextBlock}`

  const contents: GeminiContent[] = params.history
    .filter((m) => !m.isStreaming && !m.error && m.content.trim().length > 0)
    .slice(-8)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }))

  contents.push({
    role: 'user',
    parts: [{ text: params.userQuery }],
  })

  // Step 4: Call Gemini with automatic model fallback on 503/429
  const fallbackChain: ModelId[] = [
    params.model,
    ...(params.model !== 'gemini-3-flash-preview' ? (['gemini-3-flash-preview'] as ModelId[]) : []),
    ...(params.model !== 'gemini-3.1-flash-lite' ? (['gemini-3.1-flash-lite'] as ModelId[]) : []),
  ]

  let activeModel: ModelId = fallbackChain[0]
  let fallbackFrom: string | undefined
  let accumulated = ''
  const allToolCalls: ToolCallTrace[] = []
  let totalPromptTokens = 0
  let totalCompletionTokens = 0

  let turnResult: Awaited<ReturnType<typeof streamGeminiTurn>> | null = null
  let lastError: unknown

  for (let i = 0; i < fallbackChain.length; i += 1) {
    const candidateModel = fallbackChain[i]
    try {
      accumulated = ''
      turnResult = await streamGeminiTurn({
        apiKey: key,
        model: candidateModel,
        systemInstruction: fullSystemPrompt,
        contents,
        temperature: params.temperature,
        toolsEnabled: params.toolsEnabled,
        signal: params.signal,
        onTextDelta: (delta) => {
          accumulated += delta
          params.onToken(accumulated)
        },
      })
      activeModel = candidateModel
      if (i > 0) fallbackFrom = fallbackChain[0]
      break
    } catch (err) {
      lastError = err
      const status = (err as Error & { status?: number }).status
      if (params.signal?.aborted) throw err
      if ((status === 503 || status === 429 || status === 404) && i < fallbackChain.length - 1) {
        continue
      }
      throw err
    }
  }

  if (!turnResult) {
    throw lastError instanceof Error ? lastError : new Error('Gemini request failed.')
  }

  totalPromptTokens += turnResult.promptTokens
  totalCompletionTokens += turnResult.completionTokens

  // Step 5: Handle Function Calling loop (single round of parallel tool calls)
  if (turnResult.functionCalls.length > 0) {
    const executedTraces = await Promise.all(
      turnResult.functionCalls.map((fc) =>
        executeToolCall(fc.name, fc.args, {
          documents: params.documents,
          chunks: params.chunks,
        }),
      ),
    )
    allToolCalls.push(...executedTraces)
    params.onToolCalls?.(allToolCalls)

    const nextContents: GeminiContent[] = [
      ...contents,
      { role: 'model', parts: turnResult.rawModelParts },
      {
        role: 'user',
        parts: executedTraces.map((trace) => ({
          functionResponse: {
            name: trace.name,
            response: { result: JSON.parse(trace.result) },
          },
        })),
      },
    ]

    accumulated = ''
    const followUp = await streamGeminiTurn({
      apiKey: key,
      model: activeModel,
      systemInstruction: fullSystemPrompt,
      contents: nextContents,
      temperature: params.temperature,
      toolsEnabled: false,
      signal: params.signal,
      onTextDelta: (delta) => {
        accumulated += delta
        params.onToken(accumulated)
      },
    })

    totalPromptTokens += followUp.promptTokens
    totalCompletionTokens += followUp.completionTokens
    turnResult = followUp
  }

  const finalPromptTokens =
    totalPromptTokens || Math.round((fullSystemPrompt.length + params.userQuery.length) / 4)
  const finalCompletionTokens =
    totalCompletionTokens || Math.max(1, Math.round(turnResult.text.length / 4))

  return {
    text: turnResult.text,
    citations,
    toolCalls: allToolCalls,
    telemetry: {
      model: activeModel,
      fallbackFrom,
      latencyMs: Math.round(performance.now() - startedAt),
      promptTokens: finalPromptTokens,
      completionTokens: finalCompletionTokens,
      totalTokens: finalPromptTokens + finalCompletionTokens,
      estimatedCostUsd: estimateCostUsd(activeModel, finalPromptTokens, finalCompletionTokens),
      mode: 'live',
      retrievedCount: citations.length,
    },
  }
}
