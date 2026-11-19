import { useCallback, useMemo, useRef, useState } from 'react'
import { ApiKeyModal } from './components/ApiKeyModal'
import { ChatView } from './components/ChatView'
import { Header } from './components/Header'
import { KnowledgeView } from './components/KnowledgeView'
import { TelemetryEvalView } from './components/TelemetryEvalView'
import {
  GOLDEN_EVAL_CASES,
  INITIAL_DOCUMENTS,
  PROMPT_PRESETS,
} from './data/presets'
import { resolveEffectiveApiKey, runAssistantTurn } from './services/gemini'
import { buildAllChunks, embedTexts } from './services/rag'
import type {
  ChatMessage,
  EvalResult,
  KnowledgeDocument,
  ModelId,
  PromptPreset,
  RagConfig,
  TabId,
} from './types'

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('chat')
  const [selectedModel, setSelectedModel] = useState<ModelId>('gemini-3-flash-preview')
  const [activePreset, setActivePreset] = useState<PromptPreset>(PROMPT_PRESETS[0])

  const [documents, setDocuments] = useState<KnowledgeDocument[]>(INITIAL_DOCUMENTS)
  const [ragConfig, setRagConfig] = useState<RagConfig>({
    enabled: true,
    chunkSize: 420,
    overlap: 80,
    topK: 3,
  })
  const [toolsEnabled, setToolsEnabled] = useState(true)

  const [embeddingsMap, setEmbeddingsMap] = useState<Map<string, number[]>>(() => new Map())
  const [isEmbedding, setIsEmbedding] = useState(false)
  const [embedStatus, setEmbedStatus] = useState<string | null>(null)

  const [keyVersion, setKeyVersion] = useState(0)
  const effectiveKey = useMemo(() => {
    void keyVersion
    return resolveEffectiveApiKey()
  }, [keyVersion])

  const [forceSandbox, setForceSandbox] = useState<boolean>(false)
  const [isApiModalOpen, setIsApiModalOpen] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const [evalResults, setEvalResults] = useState<EvalResult[]>([])
  const [isRunningEval, setIsRunningEval] = useState(false)

  const chunks = useMemo(
    () =>
      buildAllChunks(
        documents,
        ragConfig.chunkSize,
        ragConfig.overlap,
        embeddingsMap,
      ),
    [documents, ragConfig.chunkSize, ragConfig.overlap, embeddingsMap],
  )

  const enabledDocCount = useMemo(
    () => documents.filter((d) => d.enabled).length,
    [documents],
  )

  const hasLiveKey = Boolean(effectiveKey.key) && !forceSandbox

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (isGenerating) return

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      }

      const assistantId = `a-${Date.now() + 1}`
      const placeholderMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
      }

      const historySnapshot = [...messages]
      setMessages((prev) => [...prev, userMsg, placeholderMsg])
      setIsGenerating(true)

      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const result = await runAssistantTurn({
          history: historySnapshot,
          userQuery: text,
          model: selectedModel,
          systemPrompt: activePreset.systemPrompt,
          temperature: activePreset.temperature,
          ragEnabled: ragConfig.enabled,
          topK: ragConfig.topK,
          toolsEnabled,
          forceSandbox,
          documents,
          chunks,
          signal: controller.signal,
          onToken: (accumulated) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m)),
            )
          },
          onCitations: (citations) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, citations } : m)),
            )
          },
          onToolCalls: (toolCalls) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, toolCalls } : m)),
            )
          },
        })

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: result.text || 'No response generated.',
                  citations: result.citations,
                  toolCalls: result.toolCalls,
                  telemetry: result.telemetry,
                  isStreaming: false,
                }
              : m,
          ),
        )
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError'
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  isStreaming: false,
                  content: isAbort ? `${m.content}\n\n_[Generation stopped]_` : m.content,
                  error: isAbort
                    ? undefined
                    : err instanceof Error
                      ? err.message
                      : 'Request failed.',
                }
              : m,
          ),
        )
      } finally {
        setIsGenerating(false)
        abortControllerRef.current = null
      }
    },
    [
      isGenerating,
      messages,
      selectedModel,
      activePreset,
      ragConfig.enabled,
      ragConfig.topK,
      toolsEnabled,
      forceSandbox,
      documents,
      chunks,
    ],
  )

  const handleStopGeneration = () => {
    abortControllerRef.current?.abort()
  }

  const handleEmbedAll = async () => {
    if (!hasLiveKey) return
    setIsEmbedding(true)
    setEmbedStatus(null)
    const texts = chunks.map((c) => c.text)
    const nextCache = new Map(embeddingsMap)
    const res = await embedTexts(texts, effectiveKey.key, nextCache)
    setEmbeddingsMap(nextCache)
    setIsEmbedding(false)
    setEmbedStatus(
      res.error
        ? `Embedding warning: ${res.error}`
        : `Indexed ${res.embeddedCount} chunks via gemini-embedding-001.`,
    )
  }

  const handleRunEval = async () => {
    if (isRunningEval) return
    setIsRunningEval(true)
    setEvalResults([])

    const collected: EvalResult[] = []
    for (const tc of GOLDEN_EVAL_CASES) {
      const res = await runAssistantTurn({
        history: [],
        userQuery: tc.query,
        model: selectedModel,
        systemPrompt: PROMPT_PRESETS[0].systemPrompt,
        temperature: 0.1,
        ragEnabled: tc.requiresRag,
        topK: ragConfig.topK,
        toolsEnabled: false,
        forceSandbox,
        documents,
        chunks,
        onToken: () => {},
      })

      const lower = res.text.toLowerCase()
      const matchedKeywords = tc.expectedKeywords.filter((kw) =>
        lower.includes(kw.toLowerCase()),
      )
      const missingKeywords = tc.expectedKeywords.filter(
        (kw) => !lower.includes(kw.toLowerCase()),
      )
      const score = matchedKeywords.length / tc.expectedKeywords.length

      collected.push({
        caseId: tc.id,
        passed: missingKeywords.length === 0,
        score,
        latencyMs: res.telemetry.latencyMs,
        responsePreview: res.text.slice(0, 220),
        matchedKeywords,
        missingKeywords,
        mode: res.telemetry.mode,
      })
      setEvalResults([...collected])
    }

    setIsRunningEval(false)
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#111111]">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
        hasApiKey={Boolean(effectiveKey.key)}
        forceSandbox={forceSandbox}
        onOpenApiModal={() => setIsApiModalOpen(true)}
        docCount={enabledDocCount}
      />

      <main>
        {activeTab === 'chat' && (
          <ChatView
            messages={messages}
            isGenerating={isGenerating}
            activePreset={activePreset}
            onSelectPreset={setActivePreset}
            ragEnabled={ragConfig.enabled}
            onToggleRag={() =>
              setRagConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
            }
            toolsEnabled={toolsEnabled}
            onToggleTools={() => setToolsEnabled((v) => !v)}
            enabledDocCount={enabledDocCount}
            onSendMessage={handleSendMessage}
            onStopGeneration={handleStopGeneration}
            onClearChat={() => setMessages([])}
          />
        )}

        {activeTab === 'knowledge' && (
          <KnowledgeView
            documents={documents}
            chunks={chunks}
            ragConfig={ragConfig}
            onUpdateRagConfig={setRagConfig}
            onToggleDocument={(id) =>
              setDocuments((prev) =>
                prev.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d)),
              )
            }
            onAddDocument={(doc) =>
              setDocuments((prev) => [
                {
                  ...doc,
                  id: `doc-${Date.now()}`,
                  createdAt: new Date().toISOString().slice(0, 10),
                },
                ...prev,
              ])
            }
            onDeleteDocument={(id) =>
              setDocuments((prev) => prev.filter((d) => d.id !== id))
            }
            onEmbedAll={handleEmbedAll}
            isEmbedding={isEmbedding}
            embedStatus={embedStatus}
            hasLiveKey={hasLiveKey}
            apiKey={effectiveKey.key}
          />
        )}

        {activeTab === 'telemetry' && (
          <TelemetryEvalView
            messages={messages}
            activePreset={activePreset}
            onUpdatePreset={setActivePreset}
            onSelectPreset={setActivePreset}
            evalResults={evalResults}
            isRunningEval={isRunningEval}
            onRunEval={handleRunEval}
          />
        )}
      </main>

      <ApiKeyModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        forceSandbox={forceSandbox}
        onToggleSandbox={setForceSandbox}
        onKeyUpdated={() => setKeyVersion((v) => v + 1)}
      />
    </div>
  )
}

export default App
