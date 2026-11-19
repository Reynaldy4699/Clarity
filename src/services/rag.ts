import type { DocumentChunk, KnowledgeDocument, RetrievedChunk } from '../types'

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that',
  'it', 'as', 'from', 'what', 'how', 'when', 'where', 'who', 'which', 'why',
  'do', 'does', 'did', 'can', 'could', 'would', 'should', 'our', 'your', 'we',
])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_.\-/]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
}

/**
 * Splits a document into overlapping chunks while preferring paragraph/sentence boundaries.
 */
export function chunkDocument(
  doc: KnowledgeDocument,
  chunkSize = 420,
  overlap = 80,
): DocumentChunk[] {
  const clean = doc.content.trim()
  if (!clean) return []

  const safeSize = Math.max(180, chunkSize)
  const safeOverlap = Math.min(Math.max(0, overlap), Math.floor(safeSize / 2))
  const chunks: DocumentChunk[] = []

  let start = 0
  let index = 1

  while (start < clean.length) {
    let end = Math.min(start + safeSize, clean.length)

    if (end < clean.length) {
      const slice = clean.slice(start, end)
      const lastBreak = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '), slice.lastIndexOf('\n'))
      if (lastBreak > safeSize * 0.45) {
        end = start + lastBreak + 1
      }
    }

    const text = clean.slice(start, end).trim()
    if (text.length > 0) {
      chunks.push({
        id: `${doc.id}-c${index}`,
        docId: doc.id,
        docTitle: doc.title,
        index,
        text,
        tokens: tokenize(text),
      })
      index += 1
    }

    if (end >= clean.length) break
    start = Math.max(start + 1, end - safeOverlap)
  }

  return chunks
}

export function buildAllChunks(
  docs: KnowledgeDocument[],
  chunkSize: number,
  overlap: number,
  embeddingCache?: Map<string, number[]>,
): DocumentChunk[] {
  return docs
    .filter((d) => d.enabled)
    .flatMap((doc) =>
      chunkDocument(doc, chunkSize, overlap).map((chunk) => ({
        ...chunk,
        embedding: embeddingCache?.get(chunk.text),
      })),
    )
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Embeds a list of texts using Gemini's `gemini-embedding-001` endpoint.
 */
export async function embedTexts(
  texts: string[],
  apiKey: string,
  cache: Map<string, number[]>,
): Promise<{ embeddedCount: number; error?: string }> {
  if (!apiKey || texts.length === 0) {
    return { embeddedCount: 0 }
  }

  const missing = texts.filter((t) => !cache.has(t))
  if (missing.length === 0) {
    return { embeddedCount: texts.length }
  }

  try {
    const batchSize = 20
    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = missing.slice(i, i + batchSize)
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: batch.map((text) => ({
              model: 'models/gemini-embedding-001',
              content: { parts: [{ text }] },
            })),
          }),
        },
      )

      if (!response.ok) {
        const errText = await response.text()
        return { embeddedCount: 0, error: `Embedding API ${response.status}: ${errText.slice(0, 140)}` }
      }

      const data = (await response.json()) as {
        embeddings?: Array<{ values?: number[] }>
      }
      data.embeddings?.forEach((item, idx) => {
        if (item.values && batch[idx]) {
          cache.set(batch[idx], item.values)
        }
      })
    }

    return { embeddedCount: texts.length }
  } catch (err) {
    return {
      embeddedCount: 0,
      error: err instanceof Error ? err.message : 'Embedding request failed',
    }
  }
}

export async function embedSingleQuery(query: string, apiKey: string): Promise<number[] | undefined> {
  if (!apiKey || !query.trim()) return undefined
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text: query }] },
        }),
      },
    )
    if (!response.ok) return undefined
    const data = (await response.json()) as { embedding?: { values?: number[] } }
    return data.embedding?.values
  } catch {
    return undefined
  }
}

/**
 * Hybrid BM25 + Dense Vector Cosine Retrieval.
 * Falls back cleanly to pure BM25 when embeddings are unavailable.
 */
export function retrieveRelevantChunks(
  query: string,
  chunks: DocumentChunk[],
  topK = 3,
  queryEmbedding?: number[],
): RetrievedChunk[] {
  if (chunks.length === 0 || !query.trim()) return []

  const queryTokens = tokenize(query)
  const N = chunks.length
  const avgDocLen =
    chunks.reduce((sum, c) => sum + Math.max(1, c.tokens.length), 0) / Math.max(1, N)

  // Compute IDF per query term
  const idfMap = new Map<string, number>()
  for (const term of new Set(queryTokens)) {
    const df = chunks.filter((c) => c.tokens.includes(term)).length
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1)
    idfMap.set(term, idf)
  }

  const k1 = 1.5
  const b = 0.75

  const rawBm25 = chunks.map((chunk) => {
    const docLen = Math.max(1, chunk.tokens.length)
    const freqMap = new Map<string, number>()
    for (const tok of chunk.tokens) {
      freqMap.set(tok, (freqMap.get(tok) ?? 0) + 1)
    }
    let score = 0
    for (const qTerm of queryTokens) {
      const tf = freqMap.get(qTerm) ?? 0
      if (tf === 0) continue
      const idf = idfMap.get(qTerm) ?? 0
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgDocLen))))
    }
    return score
  })

  const maxBm25 = Math.max(...rawBm25, 0.0001)

  const scored: RetrievedChunk[] = chunks.map((chunk, idx) => {
    const normBm25 = rawBm25[idx] / maxBm25
    const hasVectors = Boolean(queryEmbedding && chunk.embedding && chunk.embedding.length > 0)
    const vecScore = hasVectors ? Math.max(0, cosineSimilarity(queryEmbedding!, chunk.embedding!)) : undefined

    const combined =
      vecScore !== undefined ? 0.65 * vecScore + 0.35 * normBm25 : normBm25

    return {
      chunk,
      score: Number(combined.toFixed(4)),
      bm25Score: Number(normBm25.toFixed(4)),
      vectorScore: vecScore !== undefined ? Number(vecScore.toFixed(4)) : undefined,
      method: vecScore !== undefined ? 'hybrid' : 'bm25',
    }
  })

  return scored
    .filter((item) => item.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
