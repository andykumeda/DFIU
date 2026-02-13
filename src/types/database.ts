export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    email: string | null
                    name: string | null
                    created_at: string
                }
                Insert: {
                    id: string
                    email?: string | null
                    name?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    email?: string | null
                    name?: string | null
                    created_at?: string
                }
            }
            races: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    location: string | null
                    start_datetime: string | null
                    distance_miles: number | null
                    website_url: string | null
                    registration_url: string | null
                    packet_pickup_info: string | null
                    avg_temp_high: string | null
                    avg_temp_low: string | null
                    precip_chance: string | null
                    weather_notes: string | null
                    moon_phase: string | null
                    sunrise_time: string | null
                    sunset_time: string | null
                    overall_cutoff: string | null
                    course_record_male: string | null
                    course_record_female: string | null
                    qualifies_for: string | null
                    course_type: string | null
                    is_public: boolean
                    created_at: string
                    updated_at: string
                    timezone: string | null
                    racebook_url: string | null
                    racebook_last_updated: string | null
                    briefing_url: string | null
                    packet_pickup_url: string | null
                    past_results_url: string | null
                    media_url: string | null
                    entrants_url: string | null
                    tracking_url: string | null
                    lodging_info: string | null
                    packet_pickup_datetime: string | null
                    briefing_datetime: string | null
                    terrain_type: string | null
                }
                Insert: {
                    id?: string
                    user_id: string
                    name: string
                    location?: string | null
                    start_datetime?: string | null
                    distance_miles?: number | null
                    website_url?: string | null
                    registration_url?: string | null
                    packet_pickup_info?: string | null
                    avg_temp_high?: string | null
                    avg_temp_low?: string | null
                    precip_chance?: string | null
                    weather_notes?: string | null
                    moon_phase?: string | null
                    sunrise_time?: string | null
                    sunset_time?: string | null
                    overall_cutoff?: string | null
                    course_record_male?: string | null
                    course_record_female?: string | null
                    qualifies_for?: string | null
                    course_type?: string | null
                    is_public?: boolean
                    created_at?: string
                    updated_at?: string
                    timezone?: string | null
                    racebook_url?: string | null
                    racebook_last_updated?: string | null
                    briefing_url?: string | null
                    packet_pickup_url?: string | null
                    past_results_url?: string | null
                    media_url?: string | null
                    entrants_url?: string | null
                    tracking_url?: string | null
                    lodging_info?: string | null
                    packet_pickup_datetime?: string | null
                    briefing_datetime?: string | null
                    terrain_type?: string | null
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    location?: string | null
                    start_datetime?: string | null
                    distance_miles?: number | null
                    website_url?: string | null
                    registration_url?: string | null
                    packet_pickup_info?: string | null
                    avg_temp_high?: string | null
                    avg_temp_low?: string | null
                    precip_chance?: string | null
                    weather_notes?: string | null
                    moon_phase?: string | null
                    sunrise_time?: string | null
                    sunset_time?: string | null
                    overall_cutoff?: string | null
                    course_record_male?: string | null
                    course_record_female?: string | null
                    qualifies_for?: string | null
                    course_type?: string | null
                    is_public?: boolean
                    created_at?: string
                    updated_at?: string
                    timezone?: string | null
                    racebook_url?: string | null
                    racebook_last_updated?: string | null
                    briefing_url?: string | null
                    packet_pickup_url?: string | null
                    past_results_url?: string | null
                    media_url?: string | null
                    entrants_url?: string | null
                    tracking_url?: string | null
                    lodging_info?: string | null
                    packet_pickup_datetime?: string | null
                    briefing_datetime?: string | null
                    terrain_type?: string | null
                }
            }
            courses: {
                Row: {
                    id: string
                    race_id: string
                    raw_gpx: string | null
                    geometry: Json | null
                    elevation_samples: Json | null
                    total_distance_miles: number | null
                    total_elevation_gain_ft: number | null
                    total_elevation_loss_ft: number | null
                    min_elevation_ft: number | null
                    max_elevation_ft: number | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    race_id: string
                    raw_gpx?: string | null
                    geometry?: Json | null
                    elevation_samples?: Json | null
                    total_distance_miles?: number | null
                    total_elevation_gain_ft?: number | null
                    total_elevation_loss_ft?: number | null
                    min_elevation_ft?: number | null
                    max_elevation_ft?: number | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    race_id?: string
                    raw_gpx?: string | null
                    geometry?: Json | null
                    elevation_samples?: Json | null
                    total_distance_miles?: number | null
                    total_elevation_gain_ft?: number | null
                    total_elevation_loss_ft?: number | null
                    min_elevation_ft?: number | null
                    max_elevation_ft?: number | null
                    created_at?: string
                }
            }
            waypoints: {
                Row: {
                    id: string
                    course_id: string
                    type: string
                    name: string
                    mile: number
                    lat: number
                    lon: number
                    cutoff_time: string | null
                    has_drop_bag: boolean
                    crew_allowed: boolean
                    pacer_allowed: boolean
                    notes: string | null
                    order_index: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    course_id: string
                    type: string
                    name: string
                    mile: number
                    lat: number
                    lon: number
                    cutoff_time?: string | null
                    has_drop_bag?: boolean
                    crew_allowed?: boolean
                    pacer_allowed?: boolean
                    notes?: string | null
                    order_index: number
                    created_at?: string
                }
                Update: {
                    id?: string
                    course_id?: string
                    type?: string
                    name?: string
                    mile?: number
                    lat?: number
                    lon?: number
                    cutoff_time?: string | null
                    has_drop_bag?: boolean
                    crew_allowed?: boolean
                    pacer_allowed?: boolean
                    notes?: string | null
                    order_index?: number
                    created_at?: string
                }
            }
            terrain_nodes: {
                Row: {
                    id: string
                    course_id: string
                    mile: number
                    lat: number
                    lon: number
                    type: 'paved' | 'dirt' | 'technical' | 'double_track' | 'single_track' | 'other'
                    difficulty: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    course_id: string
                    mile: number
                    lat: number
                    lon: number
                    type?: 'paved' | 'dirt' | 'technical' | 'double_track' | 'single_track' | 'other'
                    difficulty?: number
                    created_at?: string
                }
                Update: {
                    id?: string
                    course_id?: string
                    mile?: number
                    lat?: number
                    lon?: number
                    type?: 'paved' | 'dirt' | 'technical' | 'double_track' | 'single_track' | 'other'
                    difficulty?: number
                    created_at?: string
                }
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
    }
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Race = Database['public']['Tables']['races']['Row']
export type Course = Database['public']['Tables']['courses']['Row']
export type Waypoint = Database['public']['Tables']['waypoints']['Row']
export type TerrainNode = Database['public']['Tables']['terrain_nodes']['Row']
