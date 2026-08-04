export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      courses: {
        Row: {
          created_at: string | null
          elevation_samples: Json | null
          geometry: Json | null
          id: string
          max_elevation_ft: number | null
          min_elevation_ft: number | null
          official_source_course_id: string | null
          race_id: string
          raw_gpx: string | null
          total_distance_miles: number | null
          total_elevation_gain_ft: number | null
          total_elevation_loss_ft: number | null
        }
        Insert: {
          created_at?: string | null
          elevation_samples?: Json | null
          geometry?: Json | null
          id?: string
          max_elevation_ft?: number | null
          min_elevation_ft?: number | null
          official_source_course_id?: string | null
          race_id: string
          raw_gpx?: string | null
          total_distance_miles?: number | null
          total_elevation_gain_ft?: number | null
          total_elevation_loss_ft?: number | null
        }
        Update: {
          created_at?: string | null
          elevation_samples?: Json | null
          geometry?: Json | null
          id?: string
          max_elevation_ft?: number | null
          min_elevation_ft?: number | null
          official_source_course_id?: string | null
          race_id?: string
          raw_gpx?: string | null
          total_distance_miles?: number | null
          total_elevation_gain_ft?: number | null
          total_elevation_loss_ft?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: true
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          clock_24h: boolean
          created_at: string | null
          email: string | null
          id: string
          name: string | null
          runner_profile: Json | null
          units_distance: string
          units_elevation: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          clock_24h?: boolean
          created_at?: string | null
          email?: string | null
          id: string
          name?: string | null
          runner_profile?: Json | null
          units_distance?: string
          units_elevation?: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          clock_24h?: boolean
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          runner_profile?: Json | null
          units_distance?: string
          units_elevation?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pending_race_memberships: {
        Row: {
          id: string
          race_id: string
          email: string
          role: string
          permission: string
          is_crew: boolean
          is_pacer: boolean
          invited_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          race_id: string
          email: string
          role: string
          permission?: string
          is_crew?: boolean
          is_pacer?: boolean
          invited_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          race_id?: string
          email?: string
          role?: string
          permission?: string
          is_crew?: boolean
          is_pacer?: boolean
          invited_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_race_memberships_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      race_memberships: {
        Row: {
          capabilities: Json
          granted_at: string
          granted_by: string | null
          is_crew: boolean
          is_pacer: boolean
          is_runner: boolean
          permission: string
          race_id: string
          role: string
          user_id: string
        }
        Insert: {
          capabilities?: Json
          granted_at?: string
          granted_by?: string | null
          is_crew?: boolean
          is_pacer?: boolean
          is_runner?: boolean
          permission?: string
          race_id: string
          role: string
          user_id: string
        }
        Update: {
          capabilities?: Json
          granted_at?: string
          granted_by?: string | null
          is_crew?: boolean
          is_pacer?: boolean
          is_runner?: boolean
          permission?: string
          race_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_memberships_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      race_pace_plans: {
        Row: {
          aid_station_default_delay: number
          has_calculated: boolean
          pace_chart_columns: Json | null
          pace_model_snapshot: Json | null
          plan_a_time: string
          plan_b_time: string | null
          plan_c_buffer: string
          race_id: string
          runner_profile: Json | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aid_station_default_delay?: number
          has_calculated?: boolean
          pace_chart_columns?: Json | null
          pace_model_snapshot?: Json | null
          plan_a_time?: string
          plan_b_time?: string | null
          plan_c_buffer?: string
          race_id: string
          runner_profile?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aid_station_default_delay?: number
          has_calculated?: boolean
          pace_chart_columns?: Json | null
          pace_model_snapshot?: Json | null
          plan_a_time?: string
          plan_b_time?: string | null
          plan_c_buffer?: string
          race_id?: string
          runner_profile?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "race_pace_plans_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: true
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      training_routes: {
        Row: {
          id: string
          race_id: string
          name: string
          notes: string | null
          distance_miles: number | null
          elevation_gain_ft: number | null
          elevation_loss_ft: number | null
          geometry: Json
          elevation_samples: Json | null
          raw_gpx: string | null
          start_lat: number | null
          start_lon: number | null
          finish_lat: number | null
          finish_lon: number | null
          overlap_miles: number
          overlap_segments: Json
          strava_activity_inputs: Json
          strava_activity_results: Json
          sort_order: number
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          race_id: string
          name: string
          notes?: string | null
          distance_miles?: number | null
          elevation_gain_ft?: number | null
          elevation_loss_ft?: number | null
          geometry: Json
          elevation_samples?: Json | null
          raw_gpx?: string | null
          start_lat?: number | null
          start_lon?: number | null
          finish_lat?: number | null
          finish_lon?: number | null
          overlap_miles?: number
          overlap_segments?: Json
          strava_activity_inputs?: Json
          strava_activity_results?: Json
          sort_order?: number
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          race_id?: string
          name?: string
          notes?: string | null
          distance_miles?: number | null
          elevation_gain_ft?: number | null
          elevation_loss_ft?: number | null
          geometry?: Json
          elevation_samples?: Json | null
          raw_gpx?: string | null
          start_lat?: number | null
          start_lon?: number | null
          finish_lat?: number | null
          finish_lon?: number | null
          overlap_miles?: number
          overlap_segments?: Json
          strava_activity_inputs?: Json
          strava_activity_results?: Json
          sort_order?: number
          created_at?: string
          updated_at?: string
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_routes_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      race_live_configs: {
        Row: {
          bib_number: string | null
          race_id: string
          runner_name: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bib_number?: string | null
          race_id: string
          runner_name?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bib_number?: string | null
          race_id?: string
          runner_name?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "race_live_configs_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: true
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      race_live_followed_runners: {
        Row: {
          bib_number: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          predicted_finish_minutes: number
          race_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bib_number?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          predicted_finish_minutes: number
          race_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bib_number?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          predicted_finish_minutes?: number
          race_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "race_live_followed_runners_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      race_live_followed_runner_checkins: {
        Row: {
          arrived_at: string
          created_at: string
          entered_by: string | null
          followed_runner_id: string
          id: string
          race_id: string
          waypoint_id: string
        }
        Insert: {
          arrived_at: string
          created_at?: string
          entered_by?: string | null
          followed_runner_id: string
          id?: string
          race_id: string
          waypoint_id: string
        }
        Update: {
          arrived_at?: string
          created_at?: string
          entered_by?: string | null
          followed_runner_id?: string
          id?: string
          race_id?: string
          waypoint_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_live_followed_runner_checkins_followed_runner_id_fkey"
            columns: ["followed_runner_id"]
            isOneToOne: false
            referencedRelation: "race_live_followed_runners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_live_followed_runner_checkins_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_live_followed_runner_checkins_waypoint_id_fkey"
            columns: ["waypoint_id"]
            isOneToOne: false
            referencedRelation: "waypoints"
            referencedColumns: ["id"]
          },
        ]
      }
      races: {
        Row: {
          avg_temp_high: string | null
          avg_temp_low: string | null
          briefing_datetime: string | null
          briefing_url: string | null
          course_record_female: string | null
          course_record_male: string | null
          course_type: string | null
          created_at: string | null
          distance_miles: number | null
          drop_bag_template: Json | null
          entrants_url: string | null
          id: string
          is_official: boolean
          is_public: boolean | null
          public_share_enabled: boolean
          public_share_token: string | null
          location: string | null
          lodging_info: string | null
          media_url: string | null
          moon_phase: string | null
          name: string
          overall_cutoff: string | null
          packet_pickup_datetime: string | null
          packet_pickup_info: string | null
          packet_pickup_url: string | null
          past_results_url: string | null
          precip_chance: string | null
          qualifies_for: string | null
          official_at: string | null
          official_source_race_id: string | null
          race_director_user_id: string | null
          racebook_last_updated: string | null
          racebook_url: string | null
          registration_url: string | null
          resources_config: Json | null
          start_datetime: string | null
          sunrise_time: string | null
          sunset_time: string | null
          terrain_type: string | null
          timezone: string | null
          tracking_url: string | null
          updated_at: string | null
          user_id: string
          weather_history: Json | null
          weather_locations: Json | null
          weather_notes: string | null
          website_url: string | null
        }
        Insert: {
          avg_temp_high?: string | null
          avg_temp_low?: string | null
          briefing_datetime?: string | null
          briefing_url?: string | null
          course_record_female?: string | null
          course_record_male?: string | null
          course_type?: string | null
          created_at?: string | null
          distance_miles?: number | null
          drop_bag_template?: Json | null
          entrants_url?: string | null
          id?: string
          is_official?: boolean
          is_public?: boolean | null
          public_share_enabled?: boolean
          public_share_token?: string | null
          location?: string | null
          lodging_info?: string | null
          media_url?: string | null
          moon_phase?: string | null
          name: string
          overall_cutoff?: string | null
          packet_pickup_datetime?: string | null
          packet_pickup_info?: string | null
          packet_pickup_url?: string | null
          past_results_url?: string | null
          precip_chance?: string | null
          qualifies_for?: string | null
          official_at?: string | null
          official_source_race_id?: string | null
          race_director_user_id?: string | null
          racebook_last_updated?: string | null
          racebook_url?: string | null
          registration_url?: string | null
          resources_config?: Json | null
          start_datetime?: string | null
          sunrise_time?: string | null
          sunset_time?: string | null
          terrain_type?: string | null
          timezone?: string | null
          tracking_url?: string | null
          updated_at?: string | null
          user_id: string
          weather_history?: Json | null
          weather_locations?: Json | null
          weather_notes?: string | null
          website_url?: string | null
        }
        Update: {
          avg_temp_high?: string | null
          avg_temp_low?: string | null
          briefing_datetime?: string | null
          briefing_url?: string | null
          course_record_female?: string | null
          course_record_male?: string | null
          course_type?: string | null
          created_at?: string | null
          distance_miles?: number | null
          drop_bag_template?: Json | null
          entrants_url?: string | null
          id?: string
          is_official?: boolean
          is_public?: boolean | null
          public_share_enabled?: boolean
          public_share_token?: string | null
          location?: string | null
          lodging_info?: string | null
          media_url?: string | null
          moon_phase?: string | null
          name?: string
          overall_cutoff?: string | null
          packet_pickup_datetime?: string | null
          packet_pickup_info?: string | null
          packet_pickup_url?: string | null
          past_results_url?: string | null
          precip_chance?: string | null
          qualifies_for?: string | null
          official_at?: string | null
          official_source_race_id?: string | null
          race_director_user_id?: string | null
          racebook_last_updated?: string | null
          racebook_url?: string | null
          registration_url?: string | null
          resources_config?: Json | null
          start_datetime?: string | null
          sunrise_time?: string | null
          sunset_time?: string | null
          terrain_type?: string | null
          timezone?: string | null
          tracking_url?: string | null
          updated_at?: string | null
          user_id?: string
          weather_history?: Json | null
          weather_locations?: Json | null
          weather_notes?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "races_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      runner_checkins: {
        Row: {
          arrived_at: string
          created_at: string
          entered_by: string | null
          id: string
          notes: string | null
          race_id: string
          waypoint_id: string
        }
        Insert: {
          arrived_at: string
          created_at?: string
          entered_by?: string | null
          id?: string
          notes?: string | null
          race_id: string
          waypoint_id: string
        }
        Update: {
          arrived_at?: string
          created_at?: string
          entered_by?: string | null
          id?: string
          notes?: string | null
          race_id?: string
          waypoint_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runner_checkins_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runner_checkins_waypoint_id_fkey"
            columns: ["waypoint_id"]
            isOneToOne: false
            referencedRelation: "waypoints"
            referencedColumns: ["id"]
          },
        ]
      }
      runner_locations: {
        Row: {
          accuracy_m: number | null
          created_at: string
          heading_deg: number | null
          id: string
          lat: number
          lon: number
          race_id: string
          recorded_at: string
          runner_user_id: string
          speed_mps: number | null
        }
        Insert: {
          accuracy_m?: number | null
          created_at?: string
          heading_deg?: number | null
          id?: string
          lat: number
          lon: number
          race_id: string
          recorded_at?: string
          runner_user_id: string
          speed_mps?: number | null
        }
        Update: {
          accuracy_m?: number | null
          created_at?: string
          heading_deg?: number | null
          id?: string
          lat?: number
          lon?: number
          race_id?: string
          recorded_at?: string
          runner_user_id?: string
          speed_mps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "runner_locations_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      runner_history: {
        Row: {
          id: string
          user_id: string
          race_name: string
          raced_at: string | null
          distance_mi: number
          elevation_gain_ft: number | null
          finish_minutes: number
          moving_minutes: number | null
          terrain_difficulty: number | null
          altitude_ft: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          race_name: string
          raced_at?: string | null
          distance_mi: number
          elevation_gain_ft?: number | null
          finish_minutes: number
          moving_minutes?: number | null
          terrain_difficulty?: number | null
          altitude_ft?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          race_name?: string
          raced_at?: string | null
          distance_mi?: number
          elevation_gain_ft?: number | null
          finish_minutes?: number
          moving_minutes?: number | null
          terrain_difficulty?: number | null
          altitude_ft?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_admins: {
        Row: {
          granted_at: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          user_id: string
        }
        Update: {
          granted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      terrain_nodes: {
        Row: {
          attributes: Json
          course_id: string
          created_at: string
          difficulty: number
          id: string
          lat: number
          lon: number
          mile: number
          official_source_terrain_node_id: string | null
          type: string
        }
        Insert: {
          attributes?: Json
          course_id: string
          created_at?: string
          difficulty?: number
          id?: string
          lat: number
          lon: number
          mile: number
          official_source_terrain_node_id?: string | null
          type?: string
        }
        Update: {
          attributes?: Json
          course_id?: string
          created_at?: string
          difficulty?: number
          id?: string
          lat?: number
          lon?: number
          mile?: number
          official_source_terrain_node_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "terrain_nodes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      waypoints: {
        Row: {
          course_id: string
          created_at: string | null
          crew_relay_notes: string | null
          crew_allowed: boolean | null
          cutoff_time: string | null
          delay: number | null
          drop_bag_items: Json | null
          drop_bag_name: string | null
          drop_bag_notes: string | null
          elevation_ft: number | null
          has_drop_bag: boolean | null
          id: string
          lat: number
          lon: number
          mile: number
          name: string
          notes: string | null
          official_source_waypoint_id: string | null
          order_index: number
          pacer_allowed: boolean | null
          runner_next_leg_notes: string | null
          type: string
        }
        Insert: {
          course_id: string
          created_at?: string | null
          crew_relay_notes?: string | null
          crew_allowed?: boolean | null
          cutoff_time?: string | null
          delay?: number | null
          drop_bag_items?: Json | null
          drop_bag_name?: string | null
          drop_bag_notes?: string | null
          elevation_ft?: number | null
          has_drop_bag?: boolean | null
          id?: string
          lat: number
          lon: number
          mile: number
          name: string
          notes?: string | null
          official_source_waypoint_id?: string | null
          order_index?: number
          pacer_allowed?: boolean | null
          runner_next_leg_notes?: string | null
          type?: string
        }
        Update: {
          course_id?: string
          created_at?: string | null
          crew_relay_notes?: string | null
          crew_allowed?: boolean | null
          cutoff_time?: string | null
          delay?: number | null
          drop_bag_items?: Json | null
          drop_bag_name?: string | null
          drop_bag_notes?: string | null
          elevation_ft?: number | null
          has_drop_bag?: boolean | null
          id?: string
          lat?: number
          lon?: number
          mile?: number
          name?: string
          notes?: string | null
          official_source_waypoint_id?: string | null
          order_index?: number
          pacer_allowed?: boolean | null
          runner_next_leg_notes?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "waypoints_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clone_race: { Args: { p_race_id: string }; Returns: string }
      delete_race: { Args: { p_race_id: string }; Returns: void }
      find_user_by_email: {
        Args: { p_email: string }
        Returns: {
          avatar_url: string
          id: string
          name: string
        }[]
      }
      get_race_members: {
        Args: { p_race_id: string }
        Returns: {
          avatar_url: string
          granted_at: string
          name: string
          permission: string
          role: string
          user_id: string
        }[]
      }
      get_pending_race_invites: {
        Args: { p_race_id: string }
        Returns: {
          id: string
          email: string
          role: string
          permission: string
          is_crew: boolean
          is_pacer: boolean
          invited_by: string | null
          invited_by_name: string | null
          created_at: string
        }[]
      }
      get_race_share_settings: {
        Args: { rid: string }
        Returns: {
          public_share_enabled: boolean
          public_share_token: string | null
        }[]
      }
      sync_official_race_to_clones: { Args: { p_source_race_id: string }; Returns: number }
      user_can_edit_race: { Args: { rid: string }; Returns: boolean }
      user_can_log_race_execution: { Args: { rid: string }; Returns: boolean }
      user_can_manage_team: { Args: { rid: string }; Returns: boolean }
      user_can_view_race: { Args: { rid: string }; Returns: boolean }
      user_is_race_member: { Args: { rid: string }; Returns: boolean }
      user_is_race_director: { Args: { rid: string }; Returns: boolean }
      user_is_runner_for_race: { Args: { rid: string }; Returns: boolean }
      user_is_site_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      user_owns_race: { Args: { rid: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// Convenience aliases used throughout the app.
export type Race = Tables<"races">
export type Course = Tables<"courses">
export type Waypoint = Tables<"waypoints">
export type Profile = Tables<"profiles">
export type TerrainNode = Tables<"terrain_nodes">
export type RaceMembership = Tables<"race_memberships">
export type SiteAdmin = Tables<"site_admins">
export type RacePacePlan = Tables<"race_pace_plans">
export type TrainingRoute = Tables<"training_routes">
export type RaceLiveConfig = Tables<"race_live_configs">
export type RaceLiveFollowedRunner = Tables<"race_live_followed_runners">
export type RaceLiveFollowedRunnerCheckin = Tables<"race_live_followed_runner_checkins">
export type RunnerCheckin = Tables<"runner_checkins">
export type RunnerLocation = Tables<"runner_locations">
