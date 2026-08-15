import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import algorithmGuide from '../../docs/ALGORITHMS.md?raw'
import { PublicPageLayout } from '@/components/ui/PublicPageLayout'

function headingText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(headingText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return headingText((node as { props: { children?: ReactNode } }).props.children)
  }
  return ''
}

function headingId(node: ReactNode): string {
  return headingText(node).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function AlgorithmReferencePage() {
  const { hash } = useLocation()

  useEffect(() => {
    const id = hash.replace(/^#/, '')
    if (!id) return
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => window.clearTimeout(timer)
  }, [hash])

  return (
    <PublicPageLayout
      eyebrow='Algorithm Reference'
      title='How DFIU calculates pace plans.'
      intro='A transparent explanation of the planning models, inputs, assumptions, and limits behind DFIU.'
    >
      <article className='rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-8'>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h2 className='sr-only'>{children}</h2>,
            h2: ({ children }) => <h2 id={headingId(children)} className='mt-10 first:mt-0 scroll-mt-24 text-2xl font-bold text-white'>{children}</h2>,
            h3: ({ children }) => <h3 id={headingId(children)} className='mt-7 scroll-mt-24 text-lg font-bold text-white'>{children}</h3>,
            p: ({ children }) => <p className='mt-3 leading-7 text-neutral-300'>{children}</p>,
            ol: ({ children }) => <ol className='mt-4 list-decimal space-y-2 pl-6 text-neutral-300'>{children}</ol>,
            ul: ({ children }) => <ul className='mt-4 list-disc space-y-2 pl-6 text-neutral-300'>{children}</ul>,
            li: ({ children }) => <li className='pl-1 leading-7'>{children}</li>,
            strong: ({ children }) => <strong className='font-semibold text-white'>{children}</strong>,
            a: ({ href, children }) => <a href={href} target='_blank' rel='noreferrer' className='text-blue-400 underline underline-offset-4 hover:text-blue-300'>{children}</a>,
            table: ({ children }) => <div className='mt-4 overflow-x-auto'><table className='min-w-full text-left text-sm'>{children}</table></div>,
            th: ({ children }) => <th className='border-b border-neutral-700 px-3 py-2 font-semibold text-white'>{children}</th>,
            td: ({ children }) => <td className='border-b border-neutral-800 px-3 py-2 text-neutral-300'>{children}</td>,
            pre: ({ children }) => <pre className='mt-4 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300'>{children}</pre>,
            code: ({ children }) => <code className='font-mono text-[13px] text-violet-200'>{children}</code>,
          }}
        >
          {algorithmGuide}
        </ReactMarkdown>
      </article>
    </PublicPageLayout>
  )
}
