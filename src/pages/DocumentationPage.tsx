import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import userGuide from '../../docs/USER_GUIDE.md?raw'
import { PublicPageLayout } from '@/components/ui/PublicPageLayout'

export default function DocumentationPage() {
  return (
    <PublicPageLayout
      eyebrow='Documentation'
      title='Plan your race with confidence.'
      intro='Use this guide to set up an event, build a pace plan, coordinate your crew, and share the information everyone needs.'
    >
      <article className='rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-8'>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h2 className='sr-only'>{children}</h2>,
            h2: ({ children }) => <h2 className='mt-10 first:mt-0 text-2xl font-bold text-white'>{children}</h2>,
            h3: ({ children }) => <h3 className='mt-7 text-lg font-bold text-white'>{children}</h3>,
            p: ({ children }) => <p className='mt-3 leading-7 text-neutral-300'>{children}</p>,
            ol: ({ children }) => <ol className='mt-4 list-decimal space-y-2 pl-6 text-neutral-300'>{children}</ol>,
            ul: ({ children }) => <ul className='mt-4 list-disc space-y-2 pl-6 text-neutral-300'>{children}</ul>,
            li: ({ children }) => <li className='pl-1 leading-7'>{children}</li>,
            strong: ({ children }) => <strong className='font-semibold text-white'>{children}</strong>,
            a: ({ href, children }) => <a href={href} className='text-blue-400 underline underline-offset-4 hover:text-blue-300'>{children}</a>,
            table: ({ children }) => <div className='mt-4 overflow-x-auto'><table className='min-w-full text-left text-sm'>{children}</table></div>,
            th: ({ children }) => <th className='border-b border-neutral-700 px-3 py-2 font-semibold text-white'>{children}</th>,
            td: ({ children }) => <td className='border-b border-neutral-800 px-3 py-2 text-neutral-300'>{children}</td>,
          }}
        >
          {userGuide}
        </ReactMarkdown>
      </article>
    </PublicPageLayout>
  )
}
