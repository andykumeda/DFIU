import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownProps {
    children: string
    className?: string
}

// Tailwind-styled markdown renderer. The typography plugin isn't installed,
// so each element is styled explicitly for the app's dark theme.
export function Markdown({ children, className }: MarkdownProps) {
    return (
        <div className={`text-neutral-300 text-sm leading-relaxed space-y-3 ${className ?? ''}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => <h1 className="text-xl font-bold text-white mt-4 first:mt-0 mb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-lg font-bold text-white mt-4 first:mt-0 mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-base font-semibold text-white mt-3 first:mt-0 mb-1.5">{children}</h3>,
                    h4: ({ children }) => <h4 className="text-sm font-semibold text-neutral-200 mt-3 first:mt-0 mb-1">{children}</h4>,
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 mb-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 mb-2">{children}</ol>,
                    li: ({ children }) => <li className="leading-snug">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline underline-offset-2 break-words"
                        >
                            {children}
                        </a>
                    ),
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-neutral-700 pl-3 italic text-neutral-400">{children}</blockquote>
                    ),
                    code: ({ children }) => (
                        <code className="bg-neutral-800 text-neutral-200 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
                    ),
                    hr: () => <hr className="border-neutral-800 my-3" />,
                    table: ({ children }) => (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse mb-2">{children}</table>
                        </div>
                    ),
                    th: ({ children }) => <th className="border border-neutral-800 px-2 py-1 font-semibold text-white">{children}</th>,
                    td: ({ children }) => <td className="border border-neutral-800 px-2 py-1">{children}</td>,
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    )
}
