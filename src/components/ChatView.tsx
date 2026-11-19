import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Database,
  RotateCcw,
  Square,
  Wrench,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PROMPT_PRESETS, STARTER_PROMPTS } from '../data/presets'
import type { ChatMessage, PromptPreset, RetrievedChunk } from '../types'
import { MarkdownText } from './MarkdownText'

interface ChatViewProps {
  messages: ChatMessage[]
  isGenerating: boolean
  activePreset: PromptPreset
  onSelectPreset: (preset: PromptPreset) => void
  ragEnabled: boolean
  onToggleRag: () => void
  toolsEnabled: boolean
  onToggleTools: () => void
  enabledDocCount: number
  onSendMessage: (text: string) => void
  onStopGeneration: () => void
  onClearChat: () => void
}

function CitationChip({ citation }: { citation: RetrievedChunk }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`minimal-btn inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
          expanded
            ? 'border-[#111111] bg-[#111111] text-white'
            : 'border-[#e4e4e7] bg-white text-[#52525b] hover:border-[#a1a1aa] hover:text-[#111111]'
        }`}
      >
        <BookOpen className="h-3 w-3" />
        <span>
          {citation.chunk.docTitle} · #{citation.chunk.index}
        </span>
        <span className={expanded ? 'text-white/75' : 'text-[#a1a1aa]'}>
          {(citation.score * 100).toFixed(0)}%
        </span>
      </button>

      {expanded && (
        <div className="animate-fade-slide-up mt-2 w-full max-w-xl rounded-xl border border-[#e4e4e7] bg-[#fafafa] p-3 text-[12px] leading-relaxed text-[#3f3f46]">
          <div className="mb-1 flex items-center justify-between text-[10.5px] font-medium uppercase tracking-wider text-[#71717a]">
            <span>
              {citation.method === 'hybrid' ? 'Hybrid (Vector + BM25)' : 'BM25 Lexical'} · Score{' '}
              {citation.score}
            </span>
            <span>Chunk #{citation.chunk.index}</span>
          </div>
          <p className="whitespace-pre-wrap">{citation.chunk.text}</p>
        </div>
      )}
    </div>
  )
}

function MessageRow({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false)
  const [showTools, setShowTools] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Ignore clipboard failures
    }
  }

  if (message.role === 'user') {
    return (
      <div className="animate-fade-slide-up flex justify-end">
        <div className="max-w-[82%] rounded-2xl rounded-br-sm bg-[#111111] px-4 py-2.5 text-[14.5px] leading-relaxed text-white shadow-xs">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-slide-up group flex flex-col items-start gap-2">
      <div className="w-full rounded-2xl border border-[#e4e4e7]/90 bg-white px-5 py-4 shadow-2xs transition-colors duration-200 hover:border-[#d4d4d8]">
        {/* Tool Call Traces */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-3 border-b border-[#f4f4f5] pb-2.5">
            <button
              type="button"
              onClick={() => setShowTools((v) => !v)}
              className="minimal-btn inline-flex items-center gap-1.5 rounded-full border border-[#e4e4e7] bg-[#fafafa] px-2.5 py-1 text-[11.5px] font-medium text-[#3f3f46] hover:border-[#a1a1aa]"
            >
              <Wrench className="h-3 w-3 text-[#52525b]" />
              <span>
                {message.toolCalls.length} tool{' '}
                {message.toolCalls.length === 1 ? 'call' : 'calls'} executed
              </span>
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-200 ${
                  showTools ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showTools && (
              <div className="animate-fade-slide-up mt-2 space-y-2">
                {message.toolCalls.map((tc, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-[#e4e4e7] bg-[#fafafa] p-2.5 font-mono text-[11.5px]"
                  >
                    <div className="flex items-center justify-between text-[#52525b]">
                      <span className="font-semibold text-[#111111]">
                        {tc.name}({JSON.stringify(tc.args)})
                      </span>
                      <span>{tc.durationMs}ms</span>
                    </div>
                    <pre className="mt-1.5 overflow-x-auto text-[11px] text-[#3f3f46]">
                      {tc.result}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Assistant Text */}
        {message.error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
            {message.error}
          </div>
        ) : message.content ? (
          <MarkdownText content={message.content} />
        ) : (
          <div className="flex items-center gap-1.5 py-1.5">
            <span className="typing-dot-1 h-1.5 w-1.5 rounded-full bg-[#71717a]" />
            <span className="typing-dot-2 h-1.5 w-1.5 rounded-full bg-[#71717a]" />
            <span className="typing-dot-3 h-1.5 w-1.5 rounded-full bg-[#71717a]" />
          </div>
        )}

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-3.5 flex flex-wrap items-start gap-1.5 border-t border-[#f4f4f5] pt-3">
            {message.citations.map((cit) => (
              <CitationChip key={cit.chunk.id} citation={cit} />
            ))}
          </div>
        )}
      </div>

      {/* Telemetry Footer */}
      {message.telemetry && !message.isStreaming && (
        <div className="flex w-full items-center justify-between px-1 text-[11px] text-[#71717a]">
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <span>{message.telemetry.model}</span>
            {message.telemetry.fallbackFrom && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
                fallback from {message.telemetry.fallbackFrom}
              </span>
            )}
            <span>·</span>
            <span>{message.telemetry.latencyMs}ms</span>
            <span>·</span>
            <span>{message.telemetry.totalTokens} tok</span>
            <span>·</span>
            <span>
              {message.telemetry.mode === 'sandbox'
                ? 'sandbox'
                : `$${message.telemetry.estimatedCostUsd.toFixed(5)}`}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="minimal-btn inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[#71717a] opacity-70 transition-opacity hover:bg-[#f4f4f5] hover:text-[#111111] group-hover:opacity-100"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-600" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

export function ChatView({
  messages,
  isGenerating,
  activePreset,
  onSelectPreset,
  ragEnabled,
  onToggleRag,
  toolsEnabled,
  onToggleTools,
  enabledDocCount,
  onSendMessage,
  onStopGeneration,
  onClearChat,
}: ChatViewProps) {
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = () => {
    const trimmed = draft.trim()
    if (!trimmed || isGenerating) return
    setDraft('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    onSendMessage(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInputResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4 sm:px-6">
      {/* Scrollable Conversation Area */}
      <div className="flex-1 overflow-y-auto py-6">
        {messages.length === 0 ? (
          <div className="animate-fade-in flex min-h-full flex-col justify-center py-6">
            <div className="mb-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#71717a]">
                Minimalist LLM Workspace
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#111111] sm:text-[28px]">
                Ask across docs, APIs, and live tools.
              </h1>
              <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[#52525b]">
                Built with React, Gemini streaming, hybrid BM25 + vector retrieval, live REST tool
                execution, and per-turn cost &amp; latency telemetry.
              </p>

              {/* Preset Pills */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {PROMPT_PRESETS.map((preset) => {
                  const selected = preset.id === activePreset.id
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onSelectPreset(preset)}
                      title={preset.tagline}
                      className={`minimal-btn rounded-full border px-3 py-1.5 text-[12px] font-medium ${
                        selected
                          ? 'border-[#111111] bg-[#111111] text-white'
                          : 'border-[#e4e4e7] bg-white text-[#52525b] hover:border-[#111111] hover:text-[#111111]'
                      }`}
                    >
                      {preset.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Starter Prompt Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {STARTER_PROMPTS.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => onSendMessage(item.prompt)}
                  className="minimal-card group flex flex-col justify-between rounded-2xl border border-[#e4e4e7] bg-white p-4 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-[#f4f4f5] px-2 py-0.5 font-mono text-[10.5px] text-[#52525b]">
                      {item.tag}
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-[#a1a1aa] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#111111]" />
                  </div>
                  <div className="mt-3">
                    <div className="text-[13.5px] font-medium text-[#111111]">{item.title}</div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[#71717a]">
                      {item.prompt}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 pb-4">
            {messages.map((msg) => (
              <MessageRow key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Minimalist Sticky Composer */}
      <div className="pb-5 pt-2">
        <div className="rounded-2xl border border-[#e4e4e7] bg-white p-3 shadow-xs transition-colors duration-200 focus-within:border-[#111111]">
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={handleInputResize}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question, query docs, or call a GitHub/cost tool..."
            className="max-h-40 w-full resize-none bg-transparent px-1 py-1 text-[14px] text-[#111111] placeholder-[#a1a1aa] outline-none"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#f4f4f5] pt-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleRag}
                className={`minimal-btn inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
                  ragEnabled
                    ? 'border-[#111111] bg-[#111111]/5 text-[#111111]'
                    : 'border-[#e4e4e7] text-[#71717a] hover:border-[#a1a1aa]'
                }`}
              >
                <Database className="h-3 w-3" />
                <span>RAG {ragEnabled ? `On (${enabledDocCount})` : 'Off'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleTools}
                className={`minimal-btn inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
                  toolsEnabled
                    ? 'border-[#111111] bg-[#111111]/5 text-[#111111]'
                    : 'border-[#e4e4e7] text-[#71717a] hover:border-[#a1a1aa]'
                }`}
              >
                <Wrench className="h-3 w-3" />
                <span>Tools {toolsEnabled ? 'On' : 'Off'}</span>
              </button>

              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={onClearChat}
                  className="minimal-btn inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] text-[#71717a] hover:bg-[#f4f4f5] hover:text-[#111111]"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {isGenerating ? (
              <button
                type="button"
                onClick={onStopGeneration}
                className="minimal-btn inline-flex h-8 items-center gap-1.5 rounded-full bg-[#111111] px-3.5 text-[12px] font-medium text-white hover:bg-[#27272a]"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!draft.trim()}
                onClick={handleSubmit}
                className="minimal-btn inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#111111] text-white hover:bg-[#27272a] disabled:cursor-not-allowed disabled:bg-[#e4e4e7] disabled:text-[#a1a1aa]"
                aria-label="Send message"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
