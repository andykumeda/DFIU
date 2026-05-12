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
          invited_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          race_id: string
          email: string
          role: string
          permission?: string
          invited_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          race_id?: string
          email?: string
          role?: string
          permission?: string
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
          permission: string
          race_id: string
          role: string
          user_id: string
        }
        Insert: {
          capabilities?: Json
          granted_at?: string
          granted_by?: string | null
          permission?: string
          race_id: string
          role: string
          user_id: string
        }
        Update: {
          capabilities?: Json
          granted_at?: string
          granted_by?: string | null
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
          has_calculated: boolean
          plan_a_time: string
          plan_b_time: string | null
          plan_c_buffer: string
          race_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          has_calculated?: boolean
          plan_a_time?: string
          plan_b_time?: string | null
          plan_c_buffer?: string
          race_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          has_calculated?: boolean
          plan_a_time?: string
          plan_b_time?: string | null
          plan_c_buffer?: string
          race_id?: string
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
          entrants_url: string | null
          id: string
          is_public: boolean | null
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
          racebook_last_updated: string | null
          racebook_url: string | null
          registration_url: string | null
          start_datetime: string | null
          sunrise_time: string | null
          sunset_time: string | null
          terrain_type: string | null
          timezone: string | null
          tracking_url: string | null
          updated_at: string | null
          user_id: string
          weather_history: Json | null
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
          entrants_url?: string | null
          id?: string
          is_public?: boolean | null
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
          racebook_last_updated?: string | null
          racebook_url?: string | null
          registration_url?: string | null
          start_datetime?: string | null
          sunrise_time?: string | null
          sunset_time?: string | null
          terrain_type?: string | null
          timezone?: string | null
          tracking_url?: string | null
          updated_at?: string | null
          user_id: string
          weather_history?: Json | null
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
          entrants_url?: string | null
          id?: string
          is_public?: boolean | null
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
          racebook_last_updated?: string | null
          racebook_url?: string | null
          registration_url?: string | null
          start_datetime?: string | null
          sunrise_time?: string | null
          sunset_time?: string | null
          terrain_type?: string | null
          timezone?: string | null
          tracking_url?: string | null
          updated_at?: string | null
          user_id?: string
          weather_history?: Json | null
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
          course_id: string
          created_at: string
          difficulty: number
          id: string
          lat: number
          lon: number
          mile: number
          type: string
        }
        Insert: {
          course_id: string
          created_at?: string
          difficulty?: number
          id?: string
          lat: number
          lon: number
          mile: number
          type?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          difficulty?: number
          id?: string
          lat?: number
          lon?: number
          mile?: number
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
          order_index: number
          pacer_allowed: boolean | null
          type: string
        }
        Insert: {
          course_id: string
          created_at?: string | null
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
          order_index?: number
          pacer_allowed?: boolean | null
          type?: string
        }
        Update: {
          course_id?: string
          created_at?: string | null
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
          order_index?: number
          pacer_allowed?: boolean | null
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
          invited_by: string | null
          invited_by_name: string | null
          created_at: string
        }[]
      }
      user_can_edit_race: { Args: { rid: string }; Returns: boolean }
      user_can_view_race: { Args: { rid: string }; Returns: boolean }
      user_is_race_member: { Args: { rid: string }; Returns: boolean }
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
export type RunnerCheckin = Tables<"runner_checkins">
