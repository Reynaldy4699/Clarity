import { Activity, Database, KeyRound, MessageSquare, Sparkles } from 'lucide-react'
import { GEMINI_MODELS } from '../data/presets'
import type { ModelId, TabId } from '../types'

interface HeaderProps {
  activeTab: TabId
  onSelectTab: (tab: TabId) => void
  selectedModel: ModelId
  onSelectModel: (model: ModelId) => void
  hasApiKey: boolean
  forceSandbox: boolean
  onOpenApiModal: () => void
  docCount: number
}

const TABS: Array<{ id: TabId; label: string; icon: typeof MessageSquare }> = [
  { id: 'chat', label: 'Assistant', icon: MessageSquare },
  { id: 'knowledge', label: 'Knowledge', icon: Database },
  { id: 'telemetry', label: 'Telemetry & Eval', icon: Activity },
]

export function Header({
  activeTab,
  onSelectTab,
  selectedModel,
  onSelectModel,
  hasApiKey,
  forceSandbox,
  onOpenApiModal,
  docCount,
}: HeaderProps) {
  const isLive = hasApiKey && !forceSandbox

  return (
    <header className="sticky top-0 z-30 border-b border-[#e4e4e7]/80 bg-[#fafafa]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#111111] text-white transition-transform duration-200 hover:scale-105">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[14.5px] font-semibold tracking-tight text-[#111111]">
              Clarity
            </span>
            <span className="hidden text-[11.5px] text-[#71717a] sm:inline">
              RAG &amp; Agent Studio
            </span>
          </div>
        </div>

        {/* Minimalist Pill Navigation */}
        <nav className="flex items-center rounded-full border border-[#e4e4e7] bg-white p-0.5 shadow-2xs">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`minimal-btn inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium ${
                  isActive
                    ? 'bg-[#111111] text-white shadow-xs'
                    : 'text-[#52525b] hover:bg-[#f4f4f5] hover:text-[#111111]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {tab.id === 'knowledge' && (
                  <span
                    className={`rounded-full px-1.5 py-0 text-[10px] ${
                      isActive ? 'bg-white/20 text-white' : 'bg-[#f4f4f5] text-[#71717a]'
                    }`}
                  >
                    {docCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Model + API Key Status */}
        <div className="flex items-center gap-2">
          <select
            aria-label="Select Gemini Model"
            value={selectedModel}
            onChange={(e) => onSelectModel(e.target.value as ModelId)}
            className="hidden h-8 cursor-pointer rounded-full border border-[#e4e4e7] bg-white px-2.5 text-[12px] font-medium text-[#27272a] outline-none transition-colors hover:border-[#a1a1aa] md:block"
          >
            {GEMINI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onOpenApiModal}
            className={`minimal-btn inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium ${
              isLive
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-50'
                : 'border-[#e4e4e7] bg-white text-[#52525b] hover:border-[#111111] hover:text-[#111111]'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isLive ? 'animate-pulse-ring bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <KeyRound className="h-3 w-3" />
            <span className="hidden sm:inline">{isLive ? 'Gemini Live' : 'Local RAG'}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
