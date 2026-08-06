import { Link, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { RACE_SELECT } from '../lib/race-select'
import { Race } from '../types/database'
import styles from './SplashPage.module.css'
import { useAuth } from '../features/auth/AuthContext'
import { CheckCircle2 } from 'lucide-react'

export default function SplashPage() {
  const { user } = useAuth()
  const [publicRaces, setPublicRaces] = useState<Race[]>([])

  useEffect(() => {
    async function fetchPublicRaces() {
      const { data } = await supabase
        .from('races')
        .select(RACE_SELECT)
        .eq('is_public', true)
        .order('start_datetime', { ascending: true })

      if (data) {
        setPublicRaces(data as unknown as Race[])
      }
    }

    fetchPublicRaces()
  }, [])

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <h1 className={styles.title}>
          Don&apos;t F* It Up!
        </h1>
        <p className={styles.tagline}>
          Plan the race. Respect the trail. Don&apos;t F* It Up.
        </p>
        <p className={styles.subtitle}>
          Centralize your course, pace plan, logistics, and crew info in one place.
          Keep the details visible so you don&apos;t F*.It.Up on race day.
        </p>

        <div className={styles.cta}>
          <Link to="/signup" className={styles.primaryBtn}>
            Get Started
          </Link>
          <Link to="/login" className={styles.secondaryBtn}>
            Sign In
          </Link>
          <Link to="/ac100?demo=1" className={styles.demoBtn}>
            Try Angeles Crest 100 (demo)
          </Link>
        </div>
      </div>

      <div className={styles.features}>
        {publicRaces && publicRaces.length > 0 && (
          <div className={styles.publicRaces}>
            <h2>Public Races</h2>
            <div className={styles.raceGrid}>
              {publicRaces.map((race) => {
                const isAc100Demo =
                  race.public_share_alias === 'ac100' ||
                  race.name.toLowerCase().includes('angeles crest')
                return (
                  <Link
                    key={race.id}
                    to={`/race/${race.id}?demo=1`}
                    className={styles.raceCard}
                  >
                    <h3>
                      {race.name}
                      {race.is_official && (
                        <CheckCircle2
                          size={16}
                          color="#60a5fa"
                          aria-label="Official event"
                          style={{ display: 'inline-block', marginLeft: 6, verticalAlign: '-2px' }}
                        />
                      )}
                    </h3>
                    <div className={styles.raceMeta}>
                      <span>{race.distance_miles ? `${race.distance_miles}mi` : ''}</span>
                      <span>{race.start_datetime ? new Date(race.start_datetime).toLocaleDateString() : ''}</span>
                    </div>
                    {race.location && <p className={styles.raceLocation}>{race.location}</p>}
                    {isAc100Demo && <p className={styles.demoBadge}>Demo — try without an account</p>}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        <div className={styles.feature}>
          <span className={styles.featureIcon}>⏱️</span>
          <h3>Pace Plans</h3>
          <p>Goal-time Plan A/B/C with grade, terrain, weather, night, and runner-profile factors.</p>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureIcon}>📍</span>
          <h3>Crew &amp; Drop Bags</h3>
          <p>Mobile Crew View with ETAs, check-ins, and Start/Finish/crew drop bags.</p>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureIcon}>🏃</span>
          <h3>Training &amp; Strava</h3>
          <p>Course-overlap training routes and Strava activity analysis against your race.</p>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureIcon}>📡</span>
          <h3>Live Race Day</h3>
          <p>Livestream and results embeds plus followed-runner location and ETAs.</p>
        </div>
      </div>
    </main>
  )
}
