import { CheckCircle2, KeyRound, ShieldCheck, X, XCircle } from 'lucide-react'
import { useState } from 'react'
import { resolveEffectiveApiKey, saveStoredApiKey, testGeminiConnection } from '../services/gemini'

interface ApiKeyModalProps {
  isOpen: boolean
  onClose: () => void
  forceSandbox: boolean
  onToggleSandbox: (sandbox: boolean) => void
  onKeyUpdated: () => void
}

export function ApiKeyModal({
  isOpen,
  onClose,
  forceSandbox,
  onToggleSandbox,
  onKeyUpdated,
}: ApiKeyModalProps) {
  const effective = resolveEffectiveApiKey()
  const [inputKey, setInputKey] = useState(
    effective.source === 'browser' ? effective.key : '',
  )
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)

  if (!isOpen) return null

  const handleSaveAndTest = async () => {
    const candidate = inputKey.trim() || (effective.source === 'env' ? effective.key : '')
    if (!candidate) {
      saveStoredApiKey('')
      onToggleSandbox(true)
      onKeyUpdated()
      setStatus({ ok: true, message: 'Switched to local Sandbox Mode (no key stored).' })
      return
    }

    setTesting(true)
    setStatus(null)
    const result = await testGeminiConnection(candidate)
    setTesting(false)
    setStatus(result)

    if (result.ok) {
      if (inputKey.trim()) {
        saveStoredApiKey(inputKey.trim())
      }
      onToggleSandbox(false)
      onKeyUpdated()
    }
  }

  const handleClearBrowserKey = () => {
    saveStoredApiKey('')
    setInputKey('')
    setStatus(null)
    onKeyUpdated()
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-xs">
      <div className="animate-scale-in w-full max-w-md rounded-2xl border border-[#e4e4e7] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e4e4e7] bg-[#fafafa]">
              <KeyRound className="h-4 w-4 text-[#111111]" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[#111111]">
                Gemini API Configuration
              </h2>
              <p className="text-[12px] text-[#71717a]">
                Client-side BYOK for static GitHub Pages security
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="minimal-btn rounded-lg p-1.5 text-[#71717a] hover:bg-[#f4f4f5] hover:text-[#111111]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-[#e4e4e7] bg-[#fafafa] p-3 text-[12px] leading-relaxed text-[#52525b]">
          <div className="flex items-center gap-1.5 font-medium text-[#111111]">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Zero-Leak Key Architecture</span>
          </div>
          <p className="mt-1">
            Keys are never hardcoded in source control. Locally, Clarity reads{' '}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">.env.local</code>.
            On GitHub Pages, enter your Gemini key here (stored only in your browser{' '}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">localStorage</code>)
            or run in Sandbox Mode.
          </p>
        </div>

        {effective.source === 'env' && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[12px] text-emerald-800">
            Active local <code className="font-mono">.env.local</code> key detected. You can override
            it below or toggle Sandbox Mode.
          </div>
        )}

        <div className="mt-4 space-y-2">
          <label className="block text-[12px] font-medium text-[#27272a]">
            Gemini API Key (optional if using .env.local)
          </label>
          <input
            type="password"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            placeholder={
              effective.source === 'env'
                ? 'Using .env.local key (paste here to override)'
                : 'AIza... or AQ...'
            }
            className="w-full rounded-xl border border-[#e4e4e7] bg-white px-3.5 py-2.5 font-mono text-[12.5px] text-[#111111] outline-none transition-colors focus:border-[#111111]"
          />
        </div>

        <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-[#e4e4e7] px-3.5 py-2.5 transition-colors hover:border-[#d4d4d8]">
          <div>
            <div className="text-[12.5px] font-medium text-[#111111]">Sandbox Mode</div>
            <div className="text-[11.5px] text-[#71717a]">
              Test local BM25 RAG &amp; REST tools without calling Gemini
            </div>
          </div>
          <input
            type="checkbox"
            checked={forceSandbox}
            onChange={(e) => onToggleSandbox(e.target.checked)}
            className="h-4 w-4 accent-[#111111]"
          />
        </label>

        {status && (
          <div
            className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] ${
              status.ok
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {status.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{status.message}</span>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          {effective.source === 'browser' ? (
            <button
              type="button"
              onClick={handleClearBrowserKey}
              className="minimal-btn rounded-xl px-3 py-2 text-[12.5px] font-medium text-[#71717a] hover:bg-[#f4f4f5] hover:text-[#111111]"
            >
              Clear Saved Key
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="minimal-btn rounded-xl border border-[#e4e4e7] px-3.5 py-2 text-[12.5px] font-medium text-[#52525b] hover:border-[#111111] hover:text-[#111111]"
            >
              Close
            </button>
            <button
              type="button"
              disabled={testing}
              onClick={handleSaveAndTest}
              className="minimal-btn rounded-xl bg-[#111111] px-4 py-2 text-[12.5px] font-medium text-white hover:bg-[#27272a] disabled:opacity-50"
            >
              {testing ? 'Verifying...' : 'Save & Verify'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
