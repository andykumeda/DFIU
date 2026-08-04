import { describe, expect, it } from 'vitest'
import { messageFromFunctionError } from './strava-function-error'

describe('messageFromFunctionError', () => {
  it('shows the edge function response instead of the generic non-2xx message', async () => {
    const message = await messageFromFunctionError(
      { context: new Response(JSON.stringify({ error: 'Sign in to DFIU before connecting Strava.' })) },
      'Unable to connect Strava',
    )

    expect(message).toBe('Sign in to DFIU before connecting Strava.')
  })
})
