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

  // If already logged in, redirect to dashboard?
  // The user asked to restore the splash page. Usually, if logged in, you go to dashboard.
  // But maybe they want to see the splash page even if logged in?
  // Standard pattern: Splash -> Login -> Dashboard.
  // If user visits /, and is logged in, they often get redirected to /dashboard.
  // However, the user specifically asked "this goes straight to the login box. is there a way to recover that page".
  // This implies they want to see it at /.
  // I will leave it accessible even if logged in, but the "Get Started" / "Sign In" buttons will take them to where they need to go.
  // Actually, if they click "Sign In" and are already logged in, the Login page usually redirects to Dashboard.
  // Let's just render the splash page.
  
  // OPTIONAL: If we strictly want to redirect logged-in users:
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
          Get AI-powered insights so you don&apos;t F*.It.Up on race day!
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
          <span className={styles.featureIcon}>🤖</span>
          <h3>AI Insights</h3>
          <p>Ask questions like &ldquo;When will I hit mile 60?&rdquo; and get instant answers.</p>
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
