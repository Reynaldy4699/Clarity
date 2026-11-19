import { GEMINI_MODELS } from '../data/presets'
import type { DocumentChunk, KnowledgeDocument, ToolCallTrace } from '../types'

export const GEMINI_TOOL_DECLARATIONS = [
  {
    functionDeclarations: [
      {
        name: 'fetch_github_user',
        description:
          'Fetches live public profile metadata (name, bio, public repos, followers, URL) from the GitHub REST API for a given username.',
        parameters: {
          type: 'OBJECT',
          properties: {
            username: {
              type: 'STRING',
              description: 'GitHub username to inspect, e.g. "torvalds" or "vercel".',
            },
          },
          required: ['username'],
        },
      },
      {
        name: 'estimate_llm_cost',
        description:
          'Calculates exact per-request, daily, and monthly API cost for a Gemini model based on average input/output tokens and daily request volume.',
        parameters: {
          type: 'OBJECT',
          properties: {
            modelId: {
              type: 'STRING',
              description:
                'Model ID such as "gemini-3-flash-preview", "gemini-3.1-flash-lite", or "gemini-3.1-pro-preview".',
            },
            avgInputTokens: {
              type: 'NUMBER',
              description: 'Average input tokens per request.',
            },
            avgOutputTokens: {
              type: 'NUMBER',
              description: 'Average output tokens per request.',
            },
            dailyRequests: {
              type: 'NUMBER',
              description: 'Number of requests per day.',
            },
          },
          required: ['modelId', 'avgInputTokens', 'avgOutputTokens', 'dailyRequests'],
        },
      },
      {
        name: 'inspect_knowledge_base',
        description:
          'Returns active documents, chunk counts, and vector embedding coverage in the current RAG pipeline.',
        parameters: {
          type: 'OBJECT',
          properties: {},
        },
      },
    ],
  },
]

export interface ToolRuntimeContext {
  documents: KnowledgeDocument[]
  chunks: DocumentChunk[]
}

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolRuntimeContext,
): Promise<ToolCallTrace> {
  const started = performance.now()

  try {
    if (name === 'fetch_github_user') {
      const username = String(args.username ?? '').trim().replace(/^@/, '')
      if (!username) {
        throw new Error('Missing GitHub username.')
      }
      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
        headers: { Accept: 'application/vnd.github+json' },
      })
      if (!res.ok) {
        throw new Error(`GitHub REST API returned HTTP ${res.status}`)
      }
      const data = (await res.json()) as {
        login: string
        name: string | null
        bio: string | null
        public_repos: number
        followers: number
        following: number
        html_url: string
        location: string | null
      }
      const payload = {
        login: data.login,
        name: data.name ?? data.login,
        bio: data.bio ?? 'No bio provided',
        publicRepos: data.public_repos,
        followers: data.followers,
        following: data.following,
        location: data.location ?? 'Not specified',
        url: data.html_url,
      }
      return {
        name,
        args,
        result: JSON.stringify(payload),
        durationMs: Math.round(performance.now() - started),
        status: 'success',
      }
    }

    if (name === 'estimate_llm_cost') {
      const requestedModel = String(args.modelId ?? 'gemini-3-flash-preview')
      const model =
        GEMINI_MODELS.find((m) => m.id === requestedModel || m.label.toLowerCase().includes(requestedModel.toLowerCase())) ??
        GEMINI_MODELS[0]
      const inTok = Math.max(0, Number(args.avgInputTokens) || 500)
      const outTok = Math.max(0, Number(args.avgOutputTokens) || 250)
      const daily = Math.max(1, Number(args.dailyRequests) || 100)

      const perRequest =
        (inTok / 1_000_000) * model.inputCostPer1M +
        (outTok / 1_000_000) * model.outputCostPer1M
      const dailyCost = perRequest * daily
      const monthlyCost = dailyCost * 30

      return {
        name,
        args,
        result: JSON.stringify({
          model: model.id,
          inputRatePer1M: model.inputCostPer1M,
          outputRatePer1M: model.outputCostPer1M,
          perRequestUsd: Number(perRequest.toFixed(6)),
          dailyCostUsd: Number(dailyCost.toFixed(4)),
          monthlyCostUsd: Number(monthlyCost.toFixed(2)),
        }),
        durationMs: Math.round(performance.now() - started),
        status: 'success',
      }
    }

    if (name === 'inspect_knowledge_base') {
      const enabledDocs = ctx.documents.filter((d) => d.enabled)
      const embeddedChunks = ctx.chunks.filter((c) => Boolean(c.embedding?.length)).length
      return {
        name,
        args,
        result: JSON.stringify({
          activeDocuments: enabledDocs.map((d) => ({ title: d.title, category: d.category })),
          totalChunks: ctx.chunks.length,
          embeddedChunks,
          retrievalMode: embeddedChunks > 0 ? 'Hybrid (Gemini Embeddings + BM25)' : 'Lexical (BM25)',
        }),
        durationMs: Math.round(performance.now() - started),
        status: 'success',
      }
    }

    throw new Error(`Unknown tool: ${name}`)
  } catch (err) {
    return {
      name,
      args,
      result: JSON.stringify({ error: err instanceof Error ? err.message : 'Tool execution error' }),
      durationMs: Math.round(performance.now() - started),
      status: 'error',
    }
  }
}
