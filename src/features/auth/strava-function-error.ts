export async function messageFromFunctionError(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      try {
        const body = (await context.clone().json()) as { error?: unknown }
        if (typeof body.error === 'string') return body.error
      } catch {
        // Fall back to the generic function error below.
      }
    }
  }

  return error instanceof Error ? error.message : fallback
}
