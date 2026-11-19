# Clarity AI — Minimalist RAG & Prompt Assistant

A minimalist AI assistant and document-processing workbench built with **React**, **TypeScript**, **Tailwind CSS**, and the **Google Gemini REST API**. Designed to run locally or as a zero-backend static site on **GitHub Pages**.

## Key Capabilities

- **Streaming Chatbot & Grounded Q&A**: Real-time SSE streaming via `gemini-3-flash-preview` with automatic model failover (`gemini-3.1-flash-lite`) on upstream `503`/`429` spikes.
- **Hybrid RAG Pipeline**: Client-side sliding-window chunking (`chunkSize`, `overlap`, `topK`) combining dense vector similarity (`gemini-embedding-001`) with lexical **BM25** scoring (65/35 weighting) and clickable inline source citations.
- **Live REST Tool Calling**: Gemini function calling wired to live external REST APIs (`fetch_github_user` via `api.github.com`), a token cost estimator (`estimate_llm_cost`), and knowledge base inspection.
- **Telemetry & Prompt Accuracy Eval**: Tracks per-turn latency, prompt/completion tokens, and estimated USD cost alongside a 4-case Golden Accuracy Eval suite and editable system prompt studio.
- **GitHub Pages Safe Key Architecture**: Never bundles API keys into public source code. Reads `.env.local` for local development and supports browser-side BYOK (`localStorage`) + a full local **Sandbox Mode** for zero-key evaluation.

## Architecture & Trade-offs

1. **Hybrid Retrieval vs. Pure Dense Vectors**: Dense embeddings capture semantic phrasing, while BM25 preserves exact matches for identifiers like `HTTP 429` or `Idempotency-Key`. Weighting both eliminates retrieval blind spots without requiring a hosted vector database.
2. **Client-Side BYOK vs. Hardcoded Keys**: Static GitHub Pages cannot hide secrets in client bundles. Separating `.env.local` (gitignored) for local testing from browser-stored BYOK + Sandbox Mode keeps credentials safe while ensuring visitors can always test the app.
3. **Resilient Model Routing**: Defaulting to `gemini-3-flash-preview` minimizes latency and token cost (`$0.15 / 1M` input), while automatic failover prevents transient `503` errors from breaking chat sessions.

## Local Development

```bash
npm install
cp .env.example .env.local
# Add your Gemini API key to .env.local (VITE_GEMINI_API_KEY=...)
npm run dev
```

## Deploying to GitHub Pages

This repository includes `.github/workflows/deploy.yml` and `base: './'` in `vite.config.ts`:

1. Push the repository to GitHub (`main` branch).
2. In your GitHub repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The workflow automatically builds `dist/` and deploys to `https://<username>.github.io/<repo>/`.
