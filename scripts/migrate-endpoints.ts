import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function migrateWaypoints() {
    console.log('Fetching all courses...')
    const { data: courses, error: coursesError } = await supabase.from('courses').select('id, total_distance_miles, geometry')
    if (coursesError) {
        console.error('Error fetching courses:', coursesError)
        return
    }

    for (const course of courses) {
        console.log(`Processing course ${course.id}...`)

        // Fetch waypoints for this course
        const { data: waypoints, error: waypointsError } = await supabase.from('waypoints').select('*').eq('course_id', course.id)
        if (waypointsError) {
            console.error(`Error fetching waypoints for course ${course.id}:`, waypointsError)
            continue
        }

        const totalDist = course.total_distance_miles
        if (!totalDist) continue

        const coordinates = (course.geometry as any)?.coordinates
        if (!coordinates || coordinates.length === 0) continue

        const hasStart = waypoints.some((w: any) => w.mile < 0.1)
        const hasFinish = waypoints.some((w: any) => Math.abs(w.mile - totalDist) < 0.1)

        const waypointsToInsert: any[] = []
        const maxOrder = waypoints.length > 0 ? Math.max(...waypoints.map((w: any) => w.order_index || 0)) : 0
        let nextOrder = maxOrder + 1

        if (!hasStart) {
            console.log(`  - Adding Start waypoint`)
            waypointsToInsert.push({
                course_id: course.id,
                name: 'Start',
                type: 'start',
                lat: coordinates[0][1],
                lon: coordinates[0][0],
                mile: 0,
                order_index: nextOrder++,
                has_drop_bag: false, crew_allowed: false, pacer_allowed: false, delay: 0
            })
        }

        if (!hasFinish) {
            console.log(`  - Adding Finish waypoint`)
            waypointsToInsert.push({
                course_id: course.id,
                name: 'Finish',
                type: 'finish',
                lat: coordinates[coordinates.length - 1][1],
                lon: coordinates[coordinates.length - 1][0],
                mile: totalDist,
                order_index: nextOrder++,
                has_drop_bag: false, crew_allowed: false, pacer_allowed: false, delay: 0
            })
        }

        if (waypointsToInsert.length > 0) {
            const { error: insertError } = await supabase.from('waypoints').insert(waypointsToInsert)
            if (insertError) {
                console.error(`  - Error inserting waypoints:`, insertError)
            } else {
                console.log(`  - Successfully added ${waypointsToInsert.length} waypoints`)
            }
        } else {
            console.log(`  - No missing endpoints`)
        }
    }
}

migrateWaypoints()
