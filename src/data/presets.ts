import type { EvalCase, KnowledgeDocument, ModelInfo, PromptPreset } from '../types'

export const GEMINI_MODELS: ModelInfo[] = [
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    tier: 'Balanced',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    description: 'Primary low-latency reasoning model with tool calling.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    tier: 'Fast & Low Cost',
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.3,
    description: 'High-throughput model optimized for cost-sensitive tasks.',
  },
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    tier: 'Latest Flash',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    description: 'Next-gen flash model with automatic fallback on high load.',
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    tier: 'Deep Reasoning',
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.0,
    description: 'Higher-capacity model for complex synthesis and analysis.',
  },
]

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'grounded-rag',
    name: 'Grounded Assistant',
    tagline: 'Cites retrieved knowledge chunks strictly and avoids hallucination.',
    temperature: 0.2,
    systemPrompt: `You are Clarity, a concise and accurate AI assistant.
When retrieved knowledge context is provided, ground your answer strictly in those chunks and cite them inline using [DocTitle · Chunk #].
If the provided documents do not contain the answer, state clearly what is missing rather than guessing.
Keep responses structured, crisp, and practical.`,
  },
  {
    id: 'api-copilot',
    name: 'API & Automation Copilot',
    tagline: 'Focuses on REST APIs, webhooks, system integrations, and live tools.',
    temperature: 0.3,
    systemPrompt: `You are an AI Systems & API Integration Copilot.
Help engineers design, debug, and test REST APIs, webhooks, LLM tool calls, and automation pipelines.
When asked about GitHub users or token cost projections, call the available tools directly rather than estimating.
Explain trade-offs clearly in terms of latency, reliability, and cost.`,
  },
  {
    id: 'concise-brief',
    name: 'Executive Brief',
    tagline: 'Distills technical context into crisp bullet points and trade-offs.',
    temperature: 0.15,
    systemPrompt: `You are a concise technical analyst.
Summarize answers into three clear sections when applicable:
1) Direct Answer
2) Key Evidence / Citations
3) Engineering Trade-offs
Avoid filler words and keep sentences under 22 words when possible.`,
  },
]

export const INITIAL_DOCUMENTS: KnowledgeDocument[] = [
  {
    id: 'doc-sla',
    title: 'Support & SLA Policy.md',
    category: 'Operations',
    enabled: true,
    createdAt: '2026-11-19',
    content: `# Support & SLA Policy

## Response & Uptime Targets
- Standard API uptime SLA is 99.9% measured monthly across all production REST endpoints.
- P1 critical incidents receive an initial engineering response within 15 minutes, 24/7.
- P2 degraded performance tickets receive a response within 2 business hours during US Eastern hours (9:00 AM - 5:00 PM EST).

## Refund & Billing Policy
- Annual and monthly self-serve plans are eligible for a full 14-day refund from the initial invoice date if usage is under 100,000 tokens.
- Duplicate charges or verified SLA breaches below 99.9% qualify for automatic 10% service credit on the next billing cycle.
- Enterprise custom contracts follow net-30 invoicing terms with dedicated Slack escalation channels.`,
  },
  {
    id: 'doc-api',
    title: 'REST API & Webhook Guide.md',
    category: 'Engineering',
    enabled: true,
    createdAt: '2026-11-19',
    content: `# REST API & Webhook Integration Guide

## Authentication & Rate Limits
- Authenticate every request using a Bearer token in the Authorization header: \`Authorization: Bearer <token>\`.
- Standard workspace rate limit is 120 requests per minute (RPM) with burst tolerance up to 30 concurrent connections.
- Exceeding rate limits returns HTTP 429 Too Many Requests with a \`Retry-After\` header in seconds.

## Webhooks & Idempotency
- Webhook deliveries use exponential backoff: 1s, 4s, 16s, 64s, and 300s (max 5 attempts) before moving events to the Dead Letter Queue (DLQ).
- Include an \`Idempotency-Key\` UUID header on all POST mutation endpoints to safely retry timed-out requests without duplicate side effects.
- Verify webhook payloads using the \`X-Signature-256\` HMAC-SHA256 digest.`,
  },
  {
    id: 'doc-arch',
    title: 'AI Pipeline Architecture.md',
    category: 'Architecture',
    enabled: true,
    createdAt: '2026-11-19',
    content: `# AI Pipeline Architecture & Trade-offs

## Hybrid Retrieval (BM25 + Dense Vectors)
- Clarity splits documents using a sliding window (default 420 characters with 80-character overlap) to preserve cross-sentence context.
- When an API key is active, chunks are embedded via \`gemini-embedding-001\` and scored with cosine similarity combined with lexical BM25 (65% vector, 35% BM25).
- Hybrid scoring catches exact identifiers (like HTTP 429 or Idempotency-Key) that pure dense embeddings can dilute, while embeddings handle semantic synonyms.

## Model Routing & Reliability
- Default routing uses \`gemini-3-flash-preview\` for sub-second streaming and low token cost ($0.15 / 1M input tokens).
- If an upstream model returns HTTP 503 or 429, the client automatically fails over to \`gemini-3.1-flash-lite\` and logs the fallback in per-message telemetry.
- For static GitHub Pages deployment, API keys are never bundled into source code; users supply keys via browser storage (BYOK) or run in local Sandbox Mode.`,
  },
]

export const STARTER_PROMPTS = [
  {
    title: 'Query RAG Knowledge Base',
    prompt: 'What is our webhook retry schedule and API rate limit?',
    tag: 'Hybrid RAG',
  },
  {
    title: 'Live REST Tool Calling',
    prompt: 'Look up the GitHub profile "torvalds" and summarize their public stats.',
    tag: 'Function Call',
  },
  {
    title: 'Cost & Token Projection',
    prompt: 'Estimate monthly cost for 2,000 daily chats averaging 900 input and 350 output tokens on Gemini 3 Flash.',
    tag: 'Telemetry Tool',
  },
  {
    title: 'Architecture Trade-offs',
    prompt: 'Why does Clarity combine BM25 with vector embeddings instead of using vectors alone?',
    tag: 'Grounded QA',
  },
]

export const GOLDEN_EVAL_CASES: EvalCase[] = [
  {
    id: 'eval-1',
    name: 'API Rate Limit Recall',
    query: 'What is the workspace REST API rate limit per minute and what HTTP status code is returned when exceeded?',
    expectedKeywords: ['120', '429'],
    requiresRag: true,
  },
  {
    id: 'eval-2',
    name: 'Refund Window Accuracy',
    query: 'How many days is the full refund window on self-serve plans, and what is the token usage cap?',
    expectedKeywords: ['14', '100,000'],
    requiresRag: true,
  },
  {
    id: 'eval-3',
    name: 'Webhook Retry Backoff',
    query: 'How many webhook retry attempts happen before an event goes to the Dead Letter Queue?',
    expectedKeywords: ['5', 'DLQ'],
    requiresRag: true,
  },
  {
    id: 'eval-4',
    name: 'Out-of-Scope Groundedness',
    query: 'What is the company office Wi-Fi password in Jakarta?',
    expectedKeywords: ['not', 'document'],
    requiresRag: true,
  },
]
