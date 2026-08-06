import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import userGuide from '../../docs/USER_GUIDE.md?raw'
import algorithmGuide from '../../docs/ALGORITHMS.md?raw'
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
            a: ({ href, children }) => {
              const isAlgorithmReference = href?.endsWith('ALGORITHMS.md')
              const targetHref = isAlgorithmReference ? '/documentation#algorithm-reference' : href
              const isExternal = targetHref?.startsWith('https://')
              return <a href={targetHref} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noreferrer' : undefined} className='text-blue-400 underline underline-offset-4 hover:text-blue-300'>{children}</a>
            },
            table: ({ children }) => <div className='mt-4 overflow-x-auto'><table className='min-w-full text-left text-sm'>{children}</table></div>,
            th: ({ children }) => <th className='border-b border-neutral-700 px-3 py-2 font-semibold text-white'>{children}</th>,
            td: ({ children }) => <td className='border-b border-neutral-800 px-3 py-2 text-neutral-300'>{children}</td>,
          }}
        >
          {userGuide}
        </ReactMarkdown>
        <section id='algorithm-reference' className='mt-12 border-t border-neutral-800 pt-8'>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h2 className='mt-0 text-2xl font-bold text-white'>{children}</h2>,
              h2: ({ children }) => <h3 className='mt-8 text-xl font-bold text-white'>{children}</h3>,
              h3: ({ children }) => <h4 className='mt-6 text-lg font-bold text-white'>{children}</h4>,
              p: ({ children }) => <p className='mt-3 leading-7 text-neutral-300'>{children}</p>,
              ol: ({ children }) => <ol className='mt-4 list-decimal space-y-2 pl-6 text-neutral-300'>{children}</ol>,
              ul: ({ children }) => <ul className='mt-4 list-disc space-y-2 pl-6 text-neutral-300'>{children}</ul>,
              li: ({ children }) => <li className='pl-1 leading-7'>{children}</li>,
              strong: ({ children }) => <strong className='font-semibold text-white'>{children}</strong>,
              a: ({ href, children }) => <a href={href} target='_blank' rel='noreferrer' className='text-blue-400 underline underline-offset-4 hover:text-blue-300'>{children}</a>,
              table: ({ children }) => <div className='mt-4 overflow-x-auto'><table className='min-w-full text-left text-sm'>{children}</table></div>,
              th: ({ children }) => <th className='border-b border-neutral-700 px-3 py-2 font-semibold text-white'>{children}</th>,
              td: ({ children }) => <td className='border-b border-neutral-800 px-3 py-2 text-neutral-300'>{children}</td>,
            }}
          >
            {algorithmGuide}
          </ReactMarkdown>
        </section>
      </article>
    </PublicPageLayout>
  )
}
