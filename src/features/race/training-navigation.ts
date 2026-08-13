export function trainingRouteListSearch(search: string): string {
  const params = new URLSearchParams(search)
  params.delete('training')
  const query = params.toString()
  return query ? `?${query}` : ''
}
