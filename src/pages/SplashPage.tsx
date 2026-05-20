import { Link, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Race } from '../types/database'
import styles from './SplashPage.module.css'
import { useAuth } from '../features/auth/AuthContext'

export default function SplashPage() {
  const { user } = useAuth()
  const [publicRaces, setPublicRaces] = useState<Race[]>([])

  useEffect(() => {
    async function fetchPublicRaces() {
      const { data } = await supabase
        .from('races')
        .select('*')
        .eq('is_public', true)
        .order('start_datetime', { ascending: true })

      if (data) {
        setPublicRaces(data)
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
          Race planning for 100-mile+ trail runners who obsess over the details.
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
        </div>
      </div>

      <div className={styles.features}>
        {publicRaces && publicRaces.length > 0 && (
          <div className={styles.publicRaces}>
            <h2>Public Races</h2>
            <div className={styles.raceGrid}>
              {publicRaces.map((race) => (
                <Link key={race.id} to={`/race/${race.id}`} className={styles.raceCard}>
                  <h3>{race.name}</h3>
                  <div className={styles.raceMeta}>
                    <span>{race.distance_miles ? `${race.distance_miles}mi` : ''}</span>
                    <span>{race.start_datetime ? new Date(race.start_datetime).toLocaleDateString() : ''}</span>
                  </div>
                  {race.location && <p className={styles.raceLocation}>{race.location}</p>}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className={styles.feature}>
          <span className={styles.featureIcon}>🗺️</span>
          <h3>Course Mapping</h3>
          <p>Upload your GPX, visualize elevation, and mark every aid station.</p>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureIcon}>⏱️</span>
          <h3>Pace Planning</h3>
          <p>Build detailed pace charts with cutoff tracking and printable crew sheets.</p>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureIcon}>📍</span>
          <h3>Crew View</h3>
          <p>Give crew a mobile view of the next aid station, runner ETA, and drop bag details.</p>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureIcon}>🌙</span>
          <h3>Night Planning</h3>
          <p>Know exactly when sunset hits based on your pace. No surprises.</p>
        </div>
      </div>
    </main>
  )
}
