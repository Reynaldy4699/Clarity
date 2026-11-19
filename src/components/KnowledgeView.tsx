import {
  FileText,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { embedSingleQuery, retrieveRelevantChunks } from '../services/rag'
import type { DocumentChunk, KnowledgeDocument, RagConfig, RetrievedChunk } from '../types'

interface KnowledgeViewProps {
  documents: KnowledgeDocument[]
  chunks: DocumentChunk[]
  ragConfig: RagConfig
  onUpdateRagConfig: (next: RagConfig) => void
  onToggleDocument: (id: string) => void
  onAddDocument: (doc: Omit<KnowledgeDocument, 'id' | 'createdAt'>) => void
  onDeleteDocument: (id: string) => void
  onEmbedAll: () => Promise<void>
  isEmbedding: boolean
  embedStatus: string | null
  hasLiveKey: boolean
  apiKey: string
}

export function KnowledgeView({
  documents,
  chunks,
  ragConfig,
  onUpdateRagConfig,
  onToggleDocument,
  onAddDocument,
  onDeleteDocument,
  onEmbedAll,
  isEmbedding,
  embedStatus,
  hasLiveKey,
  apiKey,
}: KnowledgeViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedDocId, setSelectedDocId] = useState<string>(documents[0]?.id ?? '')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('Custom')
  const [newContent, setNewContent] = useState('')

  const [testQuery, setTestQuery] = useState('How are webhook retries handled?')
  const [testResults, setTestResults] = useState<RetrievedChunk[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const selectedDoc = documents.find((d) => d.id === selectedDocId) ?? documents[0]
  const embeddedCount = useMemo(
    () => chunks.filter((c) => Boolean(c.embedding?.length)).length,
    [chunks],
  )

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    onAddDocument({
      title: file.name,
      category: 'Uploaded',
      content: text.slice(0, 25000),
      enabled: true,
    })
    e.target.value = ''
  }

  const handleCreateDoc = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newContent.trim()) return
    onAddDocument({
      title: newTitle.trim(),
      category: newCategory.trim() || 'Custom',
      content: newContent.trim(),
      enabled: true,
    })
    setNewTitle('')
    setNewContent('')
    setShowAddForm(false)
  }

  const handleRunRetrievalTest = async () => {
    if (!testQuery.trim()) return
    setIsSearching(true)
    const hasVectors = chunks.some((c) => Boolean(c.embedding?.length))
    const qEmb = hasLiveKey && hasVectors ? await embedSingleQuery(testQuery, apiKey) : undefined
    const results = retrieveRelevantChunks(testQuery, chunks, ragConfig.topK, qEmb)
    setTestResults(results)
    setIsSearching(false)
  }

  return (
    <div className="animate-fade-in mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#71717a]">
            Retrieval-Augmented Generation
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#111111]">
            Knowledge &amp; Vector Pipeline
          </h1>
          <p className="mt-1 text-[13.5px] text-[#52525b]">
            Upload Markdown, JSON, CSV, or text documents. Chunks are scored via hybrid{' '}
            <code className="font-mono text-[12px]">gemini-embedding-001</code> + BM25.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.json,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="minimal-btn inline-flex items-center gap-1.5 rounded-full border border-[#e4e4e7] bg-white px-3.5 py-2 text-[12.5px] font-medium text-[#27272a] hover:border-[#111111]"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload File</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="minimal-btn inline-flex items-center gap-1.5 rounded-full border border-[#e4e4e7] bg-white px-3.5 py-2 text-[12.5px] font-medium text-[#27272a] hover:border-[#111111]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Note</span>
          </button>

          {hasLiveKey && (
            <button
              type="button"
              disabled={isEmbedding || chunks.length === 0}
              onClick={onEmbedAll}
              title="Compute dense embeddings using gemini-embedding-001"
              className="minimal-btn inline-flex items-center gap-1.5 rounded-full bg-[#111111] px-4 py-2 text-[12.5px] font-medium text-white hover:bg-[#27272a] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                {isEmbedding
                  ? 'Embedding...'
                  : `Embed Chunks (${embeddedCount}/${chunks.length})`}
              </span>
            </button>
          )}
        </div>
      </div>

      {embedStatus && (
        <div className="animate-fade-slide-up rounded-xl border border-[#e4e4e7] bg-white px-4 py-2.5 text-[12.5px] text-[#3f3f46]">
          {embedStatus}
        </div>
      )}

      {/* Optional Add Note Drawer */}
      {showAddForm && (
        <form
          onSubmit={handleCreateDoc}
          className="animate-fade-slide-up space-y-3 rounded-2xl border border-[#e4e4e7] bg-white p-5 shadow-xs"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Document title (e.g. Pricing FAQ.md)"
              className="sm:col-span-2 rounded-xl border border-[#e4e4e7] px-3.5 py-2 text-[13px] outline-none focus:border-[#111111]"
            />
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Category"
              className="rounded-xl border border-[#e4e4e7] px-3.5 py-2 text-[13px] outline-none focus:border-[#111111]"
            />
          </div>
          <textarea
            required
            rows={4}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Paste policy notes, API specs, or knowledge base text..."
            className="w-full rounded-xl border border-[#e4e4e7] px-3.5 py-2.5 text-[13px] outline-none focus:border-[#111111]"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="minimal-btn rounded-xl px-3.5 py-1.5 text-[12.5px] text-[#71717a] hover:bg-[#f4f4f5]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="minimal-btn rounded-xl bg-[#111111] px-4 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#27272a]"
            >
              Save Document
            </button>
          </div>
        </form>
      )}

      {/* Chunking Controls */}
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-[#e4e4e7] bg-white p-5 sm:grid-cols-3">
        <div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-medium text-[#27272a]">Chunk Size</span>
            <span className="font-mono text-[#71717a]">{ragConfig.chunkSize} chars</span>
          </div>
          <input
            type="range"
            min={220}
            max={800}
            step={40}
            value={ragConfig.chunkSize}
            onChange={(e) =>
              onUpdateRagConfig({ ...ragConfig, chunkSize: Number(e.target.value) })
            }
            className="mt-2 w-full accent-[#111111]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-medium text-[#27272a]">Chunk Overlap</span>
            <span className="font-mono text-[#71717a]">{ragConfig.overlap} chars</span>
          </div>
          <input
            type="range"
            min={0}
            max={160}
            step={20}
            value={ragConfig.overlap}
            onChange={(e) =>
              onUpdateRagConfig({ ...ragConfig, overlap: Number(e.target.value) })
            }
            className="mt-2 w-full accent-[#111111]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-medium text-[#27272a]">Top-K Retrieved</span>
            <span className="font-mono text-[#71717a]">{ragConfig.topK} chunks</span>
          </div>
          <input
            type="range"
            min={1}
            max={6}
            step={1}
            value={ragConfig.topK}
            onChange={(e) => onUpdateRagConfig({ ...ragConfig, topK: Number(e.target.value) })}
            className="mt-2 w-full accent-[#111111]"
          />
        </div>
      </div>

      {/* Two-Column Documents + Inspector */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-2.5 lg:col-span-5">
          {documents.map((doc) => {
            const docChunkCount = chunks.filter((c) => c.docId === doc.id).length
            const isSelected = selectedDoc?.id === doc.id
            return (
              <div
                key={doc.id}
                onClick={() => setSelectedDocId(doc.id)}
                className={`minimal-card cursor-pointer rounded-2xl border p-4 ${
                  isSelected
                    ? 'border-[#111111] bg-white shadow-xs'
                    : 'border-[#e4e4e7] bg-white/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#52525b]" />
                    <div>
                      <div className="text-[13.5px] font-medium text-[#111111]">{doc.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-[#71717a]">
                        <span>{doc.category}</span>
                        <span>·</span>
                        <span>{docChunkCount} chunks</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={doc.enabled}
                      onChange={() => onToggleDocument(doc.id)}
                      aria-label={`Enable ${doc.title}`}
                      className="h-4 w-4 cursor-pointer accent-[#111111]"
                    />
                    <button
                      type="button"
                      onClick={() => onDeleteDocument(doc.id)}
                      className="minimal-btn rounded-lg p-1 text-[#a1a1aa] hover:bg-red-50 hover:text-red-600"
                      aria-label={`Delete ${doc.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Document Content Preview */}
        <div className="rounded-2xl border border-[#e4e4e7] bg-white p-5 lg:col-span-7">
          {selectedDoc ? (
            <>
              <div className="flex items-center justify-between border-b border-[#f4f4f5] pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[#52525b]" />
                  <span className="text-[14px] font-medium text-[#111111]">
                    {selectedDoc.title}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[#71717a]">
                  {selectedDoc.content.length} chars
                </span>
              </div>
              <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-[#3f3f46]">
                {selectedDoc.content}
              </pre>
            </>
          ) : (
            <p className="text-[13px] text-[#71717a]">Select a document to inspect its text.</p>
          )}
        </div>
      </div>

      {/* Live Retrieval Simulator */}
      <div className="rounded-2xl border border-[#e4e4e7] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[14.5px] font-semibold text-[#111111]">Retrieval Debugger</h2>
            <p className="text-[12px] text-[#71717a]">
              Test chunk ranking and similarity scores before running prompts.
            </p>
          </div>
          <span className="rounded-full bg-[#f4f4f5] px-2.5 py-0.5 font-mono text-[11px] text-[#52525b]">
            {embeddedCount > 0 ? 'Mode: Hybrid (Vector + BM25)' : 'Mode: Lexical BM25'}
          </span>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRunRetrievalTest()}
            placeholder="Enter a test query..."
            className="flex-1 rounded-xl border border-[#e4e4e7] px-3.5 py-2 text-[13px] outline-none transition-colors focus:border-[#111111]"
          />
          <button
            type="button"
            disabled={isSearching}
            onClick={handleRunRetrievalTest}
            className="minimal-btn inline-flex items-center gap-1.5 rounded-xl bg-[#111111] px-4 py-2 text-[12.5px] font-medium text-white hover:bg-[#27272a] disabled:opacity-50"
          >
            <Search className="h-3.5 w-3.5" />
            <span>{isSearching ? 'Scoring...' : 'Test Retrieval'}</span>
          </button>
        </div>

        {testResults && (
          <div className="mt-4 space-y-2.5">
            {testResults.length === 0 ? (
              <p className="text-[12.5px] text-[#71717a]">
                No chunks scored above threshold for this query.
              </p>
            ) : (
              testResults.map((res) => (
                <div
                  key={res.chunk.id}
                  className="animate-fade-slide-up rounded-xl border border-[#e4e4e7] bg-[#fafafa] p-3.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="font-medium text-[#111111]">
                      {res.chunk.docTitle} · Chunk #{res.chunk.index}
                    </span>
                    <div className="flex items-center gap-2 font-mono text-[#52525b]">
                      <span>BM25: {res.bm25Score}</span>
                      {res.vectorScore !== undefined && <span>Vec: {res.vectorScore}</span>}
                      <span className="rounded bg-[#111111] px-1.5 py-0.5 text-white">
                        {(res.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#e4e4e7]">
                    <div
                      className="h-full rounded-full bg-[#111111] transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.round(res.score * 100))}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-[#3f3f46]">
                    {res.chunk.text}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
