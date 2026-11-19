import { CheckCircle2, Play, Sliders, XCircle } from 'lucide-react'
import { GOLDEN_EVAL_CASES, PROMPT_PRESETS } from '../data/presets'
import type { ChatMessage, EvalResult, PromptPreset } from '../types'

interface TelemetryEvalViewProps {
  messages: ChatMessage[]
  activePreset: PromptPreset
  onUpdatePreset: (next: PromptPreset) => void
  onSelectPreset: (preset: PromptPreset) => void
  evalResults: EvalResult[]
  isRunningEval: boolean
  onRunEval: () => void
}

export function TelemetryEvalView({
  messages,
  activePreset,
  onUpdatePreset,
  onSelectPreset,
  evalResults,
  isRunningEval,
  onRunEval,
}: TelemetryEvalViewProps) {
  const assistantTurns = messages.filter((m) => m.role === 'assistant' && m.telemetry)
  const totalRequests = assistantTurns.length
  const avgLatency =
    totalRequests > 0
      ? Math.round(
          assistantTurns.reduce((s, m) => s + (m.telemetry?.latencyMs ?? 0), 0) / totalRequests,
        )
      : 0
  const totalTokens = assistantTurns.reduce((s, m) => s + (m.telemetry?.totalTokens ?? 0), 0)
  const totalCost = assistantTurns.reduce(
    (s, m) => s + (m.telemetry?.estimatedCostUsd ?? 0),
    0,
  )

  const passedCount = evalResults.filter((r) => r.passed).length
  const evalAccuracy =
    evalResults.length > 0 ? Math.round((passedCount / evalResults.length) * 100) : null

  return (
    <div className="animate-fade-in mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#71717a]">
          Observability &amp; Quality Assurance
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#111111]">
          Telemetry, Prompts &amp; Accuracy Eval
        </h1>
        <p className="mt-1 text-[13.5px] text-[#52525b]">
          Monitor latency, token throughput, and cost while validating prompt groundedness against a
          golden test suite.
        </p>
      </div>

      {/* Session KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Model Turns', value: String(totalRequests), sub: 'Completed responses' },
          { label: 'Avg Latency', value: `${avgLatency}ms`, sub: 'End-to-end TTLC' },
          { label: 'Total Tokens', value: totalTokens.toLocaleString(), sub: 'Prompt + completion' },
          { label: 'Session Cost', value: `$${totalCost.toFixed(5)}`, sub: 'Estimated USD' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="minimal-card rounded-2xl border border-[#e4e4e7] bg-white p-4"
          >
            <div className="text-[11.5px] font-medium text-[#71717a]">{kpi.label}</div>
            <div className="mt-1.5 font-mono text-xl font-semibold text-[#111111]">
              {kpi.value}
            </div>
            <div className="mt-0.5 text-[11px] text-[#a1a1aa]">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Prompt Engineering Studio */}
      <div className="rounded-2xl border border-[#e4e4e7] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-[#52525b]" />
            <h2 className="text-[15px] font-semibold text-[#111111]">System Prompt Studio</h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {PROMPT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset)}
                className={`minimal-btn rounded-full border px-3 py-1 text-[11.5px] font-medium ${
                  preset.id === activePreset.id
                    ? 'border-[#111111] bg-[#111111] text-white'
                    : 'border-[#e4e4e7] text-[#52525b] hover:border-[#111111]'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <textarea
            rows={4}
            value={activePreset.systemPrompt}
            onChange={(e) =>
              onUpdatePreset({ ...activePreset, systemPrompt: e.target.value })
            }
            className="w-full rounded-xl border border-[#e4e4e7] bg-[#fafafa] p-3 font-mono text-[12px] leading-relaxed text-[#18181b] outline-none transition-colors focus:border-[#111111] focus:bg-white"
          />

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-medium text-[#27272a]">Temperature</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={activePreset.temperature}
                onChange={(e) =>
                  onUpdatePreset({ ...activePreset, temperature: Number(e.target.value) })
                }
                className="w-36 accent-[#111111]"
              />
              <span className="font-mono text-[12px] text-[#71717a]">
                {activePreset.temperature.toFixed(2)}
              </span>
            </div>
            <span className="text-[11.5px] text-[#71717a]">
              Lower temperature improves RAG citation determinism.
            </span>
          </div>
        </div>
      </div>

      {/* Golden Accuracy Eval Runner */}
      <div className="rounded-2xl border border-[#e4e4e7] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[#111111]">
              Automated Accuracy Eval Suite
            </h2>
            <p className="text-[12px] text-[#71717a]">
              Tests retrieval recall, numerical accuracy, and out-of-scope refusal across{' '}
              {GOLDEN_EVAL_CASES.length} benchmark cases.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {evalAccuracy !== null && (
              <span className="rounded-full border border-[#e4e4e7] bg-[#fafafa] px-3 py-1 font-mono text-[12px] font-medium text-[#111111]">
                Score: {passedCount}/{evalResults.length} ({evalAccuracy}%)
              </span>
            )}
            <button
              type="button"
              disabled={isRunningEval}
              onClick={onRunEval}
              className="minimal-btn inline-flex items-center gap-1.5 rounded-full bg-[#111111] px-4 py-2 text-[12.5px] font-medium text-white hover:bg-[#27272a] disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>{isRunningEval ? 'Running Eval...' : 'Run Eval Suite'}</span>
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {GOLDEN_EVAL_CASES.map((testCase) => {
            const result = evalResults.find((r) => r.caseId === testCase.id)
            return (
              <div
                key={testCase.id}
                className="rounded-xl border border-[#e4e4e7] bg-[#fafafa] p-3.5 transition-colors hover:border-[#d4d4d8]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {result ? (
                      result.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-[#d4d4d8]" />
                    )}
                    <span className="text-[13px] font-medium text-[#111111]">
                      {testCase.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-[11px] text-[#71717a]">
                    <span>Expected: {testCase.expectedKeywords.join(', ')}</span>
                    {result && (
                      <span className="rounded bg-white px-2 py-0.5 text-[#111111]">
                        {result.latencyMs}ms · {result.mode}
                      </span>
                    )}
                  </div>
                </div>

                <p className="mt-1.5 text-[12px] text-[#52525b]">{testCase.query}</p>

                {result && (
                  <p className="mt-2 rounded-lg border border-[#e4e4e7] bg-white px-3 py-2 text-[12px] text-[#3f3f46]">
                    {result.responsePreview}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Approach & Trade-offs */}
      <div className="rounded-2xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="text-[15px] font-semibold text-[#111111]">
          Engineering Approach &amp; Trade-offs
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 text-[12.5px] leading-relaxed text-[#52525b] md:grid-cols-2">
          <div className="rounded-xl border border-[#f4f4f5] bg-[#fafafa] p-3.5">
            <div className="font-medium text-[#111111]">1. Hybrid Retrieval vs. Pure Vectors</div>
            <p className="mt-1">
              Dense embeddings (<code className="font-mono">gemini-embedding-001</code>) capture
              semantic intent, while BM25 preserves exact matches for status codes (HTTP 429) and
              SLAs (14-day window). Combining both (65/35) reduces retrieval misses without a
              backend vector DB.
            </p>
          </div>
          <div className="rounded-xl border border-[#f4f4f5] bg-[#fafafa] p-3.5">
            <div className="font-medium text-[#111111]">2. Static GitHub Pages Key Security</div>
            <p className="mt-1">
              Hardcoding keys in client bundles leaks credentials on public repos. Locally,{' '}
              <code className="font-mono">.env.local</code> supplies the key; on GitHub Pages, BYOK
              browser storage plus local Sandbox Mode keeps the demo functional and safe.
            </p>
          </div>
          <div className="rounded-xl border border-[#f4f4f5] bg-[#fafafa] p-3.5">
            <div className="font-medium text-[#111111]">3. Model Routing &amp; 503 Failover</div>
            <p className="mt-1">
              Defaults to <code className="font-mono">gemini-3-flash-preview</code> for low latency
              and cost ($0.15/1M input), with automatic fallback to{' '}
              <code className="font-mono">gemini-3.1-flash-lite</code> on upstream 503/429 spikes.
            </p>
          </div>
          <div className="rounded-xl border border-[#f4f4f5] bg-[#fafafa] p-3.5">
            <div className="font-medium text-[#111111]">4. Observable Tool Execution</div>
            <p className="mt-1">
              Function calling integrates live REST endpoints (GitHub API) and cost calculators with
              inspectable JSON traces, latency, and token telemetry on every turn.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
