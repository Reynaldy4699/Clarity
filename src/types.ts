export type TabId = 'chat' | 'knowledge' | 'telemetry'

export type ModelId =
  | 'gemini-3-flash-preview'
  | 'gemini-3.1-flash-lite'
  | 'gemini-3.8-flash'
  | 'gemini-3.1-pro-preview'

export interface ModelInfo {
  id: ModelId
  label: string
  tier: string
  inputCostPer1M: number
  outputCostPer1M: number
  description: string
}

export interface PromptPreset {
  id: string
  name: string
  tagline: string
  temperature: number
  systemPrompt: string
}

export interface KnowledgeDocument {
  id: string
  title: string
  category: string
  content: string
  enabled: boolean
  createdAt: string
}

export interface DocumentChunk {
  id: string
  docId: string
  docTitle: string
  index: number
  text: string
  tokens: string[]
  embedding?: number[]
}

export interface RetrievedChunk {
  chunk: DocumentChunk
  score: number
  bm25Score: number
  vectorScore?: number
  method: 'hybrid' | 'bm25'
}

export interface ToolCallTrace {
  name: string
  args: Record<string, unknown>
  result: string
  durationMs: number
  status: 'success' | 'error'
}

export interface MessageTelemetry {
  model: string
  fallbackFrom?: string
  latencyMs: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
  mode: 'live' | 'sandbox'
  retrievedCount: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  citations?: RetrievedChunk[]
  toolCalls?: ToolCallTrace[]
  telemetry?: MessageTelemetry
  isStreaming?: boolean
  error?: string
}

export interface RagConfig {
  enabled: boolean
  chunkSize: number
  overlap: number
  topK: number
}

export interface EvalCase {
  id: string
  name: string
  query: string
  expectedKeywords: string[]
  requiresRag: boolean
}

export interface EvalResult {
  caseId: string
  passed: boolean
  score: number
  latencyMs: number
  responsePreview: string
  matchedKeywords: string[]
  missingKeywords: string[]
  mode: 'live' | 'sandbox'
}
