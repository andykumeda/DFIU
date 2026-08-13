import { FormEvent, useState } from 'react'
import { Activity, LoaderCircle, MessageCircle, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { messageFromFunctionError } from '@/features/auth/strava-function-error'
import {
  formatDistanceMiles,
  formatMovingTime,
  normalizeStravaQuery,
  type StravaQueryResponse,
} from './strava-query'

interface QueryMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  response?: StravaQueryResponse
}

const suggestions = ['Show my recent activities', 'What are my Strava stats?', 'Show my heart-rate zones']

export function StravaQueryPanel() {
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<QueryMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitQuery = async (event?: FormEvent) => {
    event?.preventDefault()
    const normalizedQuery = normalizeStravaQuery(query)
    if (!normalizedQuery || loading) return

    const userMessage: QueryMessage = { id: Date.now(), role: 'user', text: normalizedQuery }
    setMessages(current => [...current, userMessage])
    setQuery('')
    setError(null)
    setLoading(true)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('strava-activity', {
        body: { action: 'query', query: normalizedQuery },
      })
      if (invokeError) throw invokeError
      if (!data?.answer) throw new Error('Strava returned an empty answer')
      setMessages(current => [
        ...current,
        { id: Date.now() + 1, role: 'assistant', text: data.answer, response: data as StravaQueryResponse },
      ])
    } catch (caught) {
      setError(await messageFromFunctionError(caught, 'Unable to query Strava'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mb-10" aria-labelledby="strava-query-title">
      <div className="flex items-start gap-3 mb-5">
        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-300">
          <MessageCircle className="w-5 h-5" aria-hidden />
        </div>
        <div>
          <h2 id="strava-query-title" className="text-xl font-semibold text-white">Ask Strava</h2>
          <p className="text-sm text-neutral-400 mt-1">
            Ask about your recent activities, profile, stats, zones, or a specific activity link.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 md:p-5">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 mb-4" aria-label="Suggested Strava questions">
            {suggestions.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setQuery(suggestion)}
                className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-blue-400 hover:text-white"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {messages.length > 0 && (
          <div className="space-y-3 mb-4 max-h-80 overflow-y-auto" aria-live="polite">
            {messages.map(message => (
              <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={message.role === 'user'
                  ? 'max-w-[90%] rounded-lg bg-blue-600/20 border border-blue-500/30 px-3 py-2 text-sm text-blue-100'
                  : 'max-w-[90%] rounded-lg bg-neutral-950/80 border border-neutral-800 px-3 py-2 text-sm text-neutral-200'}
                >
                  <p>{message.text}</p>
                  {message.response?.activities && message.response.activities.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {message.response.activities.map(activity => (
                        <li key={activity.id} className="border-t border-neutral-800 pt-2 first:border-0 first:pt-0">
                          <p className="font-medium text-white">{activity.name}</p>
                          <p className="text-xs text-neutral-500">
                            {activity.type ?? 'Activity'} · {formatDistanceMiles(activity.distanceMiles)} · {formatMovingTime(activity.movingSeconds)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={event => void submitQuery(event)} className="flex items-end gap-2">
          <label className="sr-only" htmlFor="strava-query-input">Ask Strava a question</label>
          <textarea
            id="strava-query-input"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submitQuery()
            }}
            rows={2}
            placeholder="e.g. Show my recent activities"
            className="min-w-0 flex-1 resize-y rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-400"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
            Ask
          </button>
        </form>
        <p className="mt-2 text-xs text-neutral-500">Press ⌘/Ctrl + Enter to send. Queries use your signed-in Strava connection.</p>
        {error && (
          <div className="mt-3 rounded-lg border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-200" role="alert">
            <div className="flex items-start gap-2"><Activity className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><p>{error}</p></div>
          </div>
        )}
      </div>
    </section>
  )
}
