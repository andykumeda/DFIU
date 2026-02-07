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
                    packet_pickup_info: string | null
                    is_public: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    name: string
                    location?: string | null
                    start_datetime?: string | null
                    distance_miles?: number | null
                    website_url?: string | null
                    packet_pickup_info?: string | null
                    is_public?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    location?: string | null
                    start_datetime?: string | null
                    distance_miles?: number | null
                    website_url?: string | null
                    packet_pickup_info?: string | null
                    is_public?: boolean
                    created_at?: string
                    updated_at?: string
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
