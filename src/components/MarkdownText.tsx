import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { sanitizeResponseText } from '../services/gemini'

function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|_[^_]+_)/g)
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-[#111111]">
          {token.slice(2, -2)}
        </strong>
      )
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code
          key={idx}
          className="rounded bg-[#f4f4f5] px-1.5 py-0.5 font-mono text-[12px] text-[#18181b]"
        >
          {token.slice(1, -1)}
        </code>
      )
    }
    if (token.startsWith('_') && token.endsWith('_') && token.length > 2) {
      return (
        <em key={idx} className="text-[#71717a]">
          {token.slice(1, -1)}
        </em>
      )
    }
    const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/)
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[#d4d4d8] underline-offset-2 transition-colors hover:text-[#111111] hover:decoration-[#111111]"
        >
          {linkMatch[1]}
        </a>
      )
    }
    return token
  })
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Ignore clipboard failures
    }
  }

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-[#e4e4e7] bg-[#fafafa]">
      <div className="flex items-center justify-between border-b border-[#e4e4e7] px-3 py-1.5 text-[11px] text-[#71717a]">
        <span className="font-mono uppercase tracking-wider">{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="minimal-btn inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-[#e4e4e7]/60 hover:text-[#111111]"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed text-[#18181b]">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function MarkdownText({ content }: { content: string }) {
  const blocks = sanitizeResponseText(content).split(/(```[\s\S]*?```)/g)

  return (
    <div className="space-y-2 text-[14.5px] leading-[1.68] text-[#27272a]">
      {blocks.map((block, bIdx) => {
        if (block.startsWith('```') && block.endsWith('```')) {
          const inner = block.slice(3, -3)
          const firstNewline = inner.indexOf('\n')
          const lang = firstNewline >= 0 ? inner.slice(0, firstNewline).trim() : ''
          const code = firstNewline >= 0 ? inner.slice(firstNewline + 1) : inner
          return <CodeBlock key={bIdx} code={code.trimEnd()} lang={lang} />
        }

        const lines = block.split('\n')
        const elements: React.ReactNode[] = []
        let listItems: string[] = []

        const flushList = (keyPrefix: string) => {
          if (listItems.length === 0) return
          elements.push(
            <ul key={`${keyPrefix}-ul`} className="my-1.5 space-y-1 pl-4">
              {listItems.map((item, idx) => (
                <li key={idx} className="relative pl-2.5 before:absolute before:left-0 before:top-[0.62em] before:h-1 before:w-1 before:rounded-full before:bg-[#a1a1aa]">
                  {renderInline(item)}
                </li>
              ))}
            </ul>,
          )
          listItems = []
        }

        lines.forEach((line, lIdx) => {
          const trimmed = line.trim()
          if (!trimmed) {
            flushList(`${bIdx}-${lIdx}`)
            return
          }

          if (/^[-*]\s+/.test(trimmed)) {
            listItems.push(trimmed.replace(/^[-*]\s+/, ''))
            return
          }

          flushList(`${bIdx}-${lIdx}`)

          if (trimmed.startsWith('### ')) {
            elements.push(
              <h4 key={`${bIdx}-${lIdx}`} className="pt-1 text-[13.5px] font-semibold text-[#111111]">
                {renderInline(trimmed.slice(4))}
              </h4>,
            )
          } else if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
            elements.push(
              <h3 key={`${bIdx}-${lIdx}`} className="pt-1 text-[15px] font-semibold text-[#111111]">
                {renderInline(trimmed.replace(/^#+\s+/, ''))}
              </h3>,
            )
          } else {
            elements.push(<p key={`${bIdx}-${lIdx}`}>{renderInline(trimmed)}</p>)
          }
        })

        flushList(`${bIdx}-end`)
        return <div key={bIdx}>{elements}</div>
      })}
    </div>
  )
}
