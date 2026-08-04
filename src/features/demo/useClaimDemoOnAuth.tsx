import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import { claimPendingDemoIfAny } from './claimDemo'
import { peekClaimDemoIntent, setClaimDemoIntent } from './demoStore'

/** After signup/login, claim any pending demo overlay into a private clone. */
export function useClaimDemoOnAuth() {
  const { user, loading, refreshMemberships } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const claiming = useRef(false)

  useEffect(() => {
    const fromQuery = searchParams.get('claim_demo')
    if (fromQuery) setClaimDemoIntent(fromQuery)
  }, [searchParams])

  useEffect(() => {
    if (loading || !user || claiming.current) return
    const sourceRaceId = peekClaimDemoIntent() || searchParams.get('claim_demo')
    if (!sourceRaceId) return

    claiming.current = true
    ;(async () => {
      const result = await claimPendingDemoIfAny({ sourceRaceId })
      claiming.current = false
      if (!result) return
      if (!result.ok) {
        alert(`Could not save your demo plan: ${result.reason}`)
        navigate('/dashboard', { replace: true })
        return
      }
      await refreshMemberships?.()
      await queryClient.invalidateQueries({ queryKey: ['races'] })
      navigate(`/race/${result.raceId}`, { replace: true })
    })()
  }, [user, loading, searchParams, navigate, refreshMemberships, queryClient])
}
