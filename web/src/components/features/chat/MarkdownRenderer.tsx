import { useMemo, type ComponentProps, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { Components } from 'react-markdown'

const CODE_BLOCK_STYLE = {
  borderRadius: '8px',
  fontSize: '13px',
  margin: '8px 0',
  fontFamily: 'var(--font-mono)',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.06)',
}

type WithChildren = { children?: ReactNode; className?: string }

function CodeBlock({ className, children, ...props }: ComponentProps<'code'>) {
  const match = /language-(\w+)/.exec(String(className ?? ''))
  if (match) {
    return (
      <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div" customStyle={CODE_BLOCK_STYLE}>
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    )
  }
  return (
    <code className="bg-accent/10 text-accent px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
      {children}
    </code>
  )
}

const Heading1 = ({ children }: WithChildren) =>
  <h1 className="text-lg font-bold text-text-primary mt-4 mb-2 font-mono">{children}</h1>

const Heading2 = ({ children }: WithChildren) =>
  <h2 className="text-base font-semibold text-text-primary mt-4 mb-2 font-mono border-b border-border-subtle/30 pb-1">{children}</h2>

const Heading3 = ({ children }: WithChildren) =>
  <h3 className="text-sm font-semibold text-text-primary mt-3 mb-1">{children}</h3>

const Paragraph = ({ children }: WithChildren) =>
  <p className="text-sm text-text-primary leading-relaxed mb-2">{children}</p>

const Bold = ({ children }: WithChildren) =>
  <strong className="font-semibold text-text-primary">{children}</strong>

const UnorderedList = ({ children }: WithChildren) =>
  <ul className="list-disc list-inside space-y-1 mb-2 text-sm text-text-primary">{children}</ul>

const OrderedList = ({ children }: WithChildren) =>
  <ol className="list-decimal list-inside space-y-1 mb-2 text-sm text-text-primary">{children}</ol>

const ListItem = ({ children }: WithChildren) =>
  <li className="text-sm text-text-secondary leading-relaxed">{children}</li>

const Divider = () =>
  <hr className="border-border-subtle/30 my-3" />

const Blockquote = ({ children }: WithChildren) =>
  <blockquote className="border-l-2 border-accent/40 pl-3 italic text-text-secondary text-sm my-2">{children}</blockquote>

export function MarkdownRenderer({ content, className }: { content: string; className?: string }) {
  const components = useMemo<Partial<Components>>(() => ({
    code: CodeBlock as Components['code'],
    h1: Heading1 as Components['h1'],
    h2: Heading2 as Components['h2'],
    h3: Heading3 as Components['h3'],
    p: Paragraph as Components['p'],
    strong: Bold as Components['strong'],
    ul: UnorderedList as Components['ul'],
    ol: OrderedList as Components['ol'],
    li: ListItem as Components['li'],
    hr: Divider as Components['hr'],
    blockquote: Blockquote as Components['blockquote'],
  }), [])

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
