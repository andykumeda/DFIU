import { useState, useEffect, useLayoutEffect } from 'react'
import { ChevronUp } from 'lucide-react'
import { useLocation } from 'react-router-dom'

export function ScrollToTop() {
    const [isVisible, setIsVisible] = useState(false)
    const { pathname, hash } = useLocation()

    useLayoutEffect(() => {
        const previousRestoration = window.history.scrollRestoration
        window.history.scrollRestoration = 'manual'
        const resetScroll = () => {
            window.scrollTo(0, 0)
            document.documentElement.scrollTop = 0
            document.body.scrollTop = 0
        }
        resetScroll()
        const frame = requestAnimationFrame(() => {
            resetScroll()
            requestAnimationFrame(resetScroll)
        })
        return () => {
            cancelAnimationFrame(frame)
            window.history.scrollRestoration = previousRestoration
        }
    }, [pathname, hash])

    // Show button when page is scrolled down
    useEffect(() => {
        const toggleVisibility = () => {
            // Show if scrolled more than 300px down
            if (window.scrollY > 300) {
                setIsVisible(true)
            } else {
                setIsVisible(false)
            }
        }

        window.addEventListener('scroll', toggleVisibility)

        return () => window.removeEventListener('scroll', toggleVisibility)
    }, [])

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        })
    }

    // Only render on non-print media so it doesn't show up when printing plans
    if (!isVisible) return null

    return (
        <button
            onClick={scrollToTop}
            className={`
        fixed bottom-6 right-6 z-[110] p-3
        bg-emerald-600 hover:bg-emerald-500 text-white
        rounded-full shadow-lg transition-all duration-300
        focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-neutral-900
        print:hidden
      `}
            aria-label="Scroll to top"
        >
            <ChevronUp className="w-6 h-6" />
        </button>
    )
}
