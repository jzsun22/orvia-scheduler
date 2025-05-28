export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      location_hours: {
        Row: {
          day_end: string
          day_of_week: string
          day_start: string
          id: string
          location_id: string
          morning_cutoff: string
        }
        Insert: {
          day_end: string
          day_of_week: string
          day_start: string
          id?: string
          location_id: string
          morning_cutoff: string
        }
        Update: {
          day_end?: string
          day_of_week?: string
          day_start?: string
          id?: string
          location_id?: string
          morning_cutoff?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_hours_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_positions: {
        Row: {
          id: string
          location_id: string | null
          position_id: string | null
        }
        Insert: {
          id?: string
          location_id?: string | null
          position_id?: string | null
        }
        Update: {
          id?: string
          location_id?: string | null
          position_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_positions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_positions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      manager_locations: {
        Row: {
          location_id: string
          manager_id: string
        }
        Insert: {
          location_id: string
          manager_id: string
        }
        Update: {
          location_id?: string
          manager_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      recurring_shift_assignments: {
        Row: {
          assignment_type: string | null
          created_at: string | null
          day_of_week: string
          end_time: string
          id: string
          location_id: string
          location_name: string | null
          position_id: string
          start_time: string
          worker_id: string
        }
        Insert: {
          assignment_type?: string | null
          created_at?: string | null
          day_of_week: string
          end_time: string
          id?: string
          location_id: string
          location_name?: string | null
          position_id: string
          start_time: string
          worker_id: string
        }
        Update: {
          assignment_type?: string | null
          created_at?: string | null
          day_of_week?: string
          end_time?: string
          id?: string
          location_id?: string
          location_name?: string | null
          position_id?: string
          start_time?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_shift_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_shift_assignments_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_shift_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_shifts: {
        Row: {
          created_at: string | null
          end_time: string | null
          id: string
          is_recurring_generated: boolean | null
          shift_date: string
          start_time: string | null
          template_id: string | null
          worker_id: string | null
        }
        Insert: {
          created_at?: string | null
          end_time?: string | null
          id?: string
          is_recurring_generated?: boolean | null
          shift_date: string
          start_time?: string | null
          template_id?: string | null
          worker_id?: string | null
        }
        Update: {
          created_at?: string | null
          end_time?: string | null
          id?: string
          is_recurring_generated?: boolean | null
          shift_date?: string
          start_time?: string | null
          template_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_shifts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shift_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_shifts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignments: {
        Row: {
          assigned_end: string | null
          assigned_start: string | null
          assignment_type: string | null
          created_at: string | null
          id: string
          is_manual_override: boolean | null
          scheduled_shift_id: string | null
          worker_id: string | null
        }
        Insert: {
          assigned_end?: string | null
          assigned_start?: string | null
          assignment_type?: string | null
          created_at?: string | null
          id?: string
          is_manual_override?: boolean | null
          scheduled_shift_id?: string | null
          worker_id?: string | null
        }
        Update: {
          assigned_end?: string | null
          assigned_start?: string | null
          assignment_type?: string | null
          created_at?: string | null
          id?: string
          is_manual_override?: boolean | null
          scheduled_shift_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_scheduled_shift_id_fkey"
            columns: ["scheduled_shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_templates: {
        Row: {
          days_of_week: string[] | null
          end_time: string
          id: string
          lead_type: string | null
          location: string
          location_id: string | null
          position_id: string | null
          schedule_column_group: number | null
          start_time: string
        }
        Insert: {
          days_of_week?: string[] | null
          end_time: string
          id?: string
          lead_type?: string | null
          location: string
          location_id?: string | null
          position_id?: string | null
          schedule_column_group?: number | null
          start_time: string
        }
        Update: {
          days_of_week?: string[] | null
          end_time?: string
          id?: string
          lead_type?: string | null
          location?: string
          location_id?: string | null
          position_id?: string | null
          schedule_column_group?: number | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_templates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_templates_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_locations: {
        Row: {
          id: string
          location_id: string
          worker_id: string
        }
        Insert: {
          id?: string
          location_id: string
          worker_id: string
        }
        Update: {
          id?: string
          location_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_locations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_positions: {
        Row: {
          position_id: string
          worker_id: string
        }
        Insert: {
          position_id: string
          worker_id: string
        }
        Update: {
          position_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_positions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_positions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          availability: Json | null
          created_at: string | null
          first_name: string | null
          id: string
          inactive: boolean | null
          is_lead: boolean | null
          job_level: string | null
          last_name: string | null
          location: string[] | null
          preferred_hours_per_week: number | null
          preferred_name: string | null
          user_id: string | null
        }
        Insert: {
          availability?: Json | null
          created_at?: string | null
          first_name?: string | null
          id?: string
          inactive?: boolean | null
          is_lead?: boolean | null
          job_level?: string | null
          last_name?: string | null
          location?: string[] | null
          preferred_hours_per_week?: number | null
          preferred_name?: string | null
          user_id?: string | null
        }
        Update: {
          availability?: Json | null
          created_at?: string | null
          first_name?: string | null
          id?: string
          inactive?: boolean | null
          is_lead?: boolean | null
          job_level?: string | null
          last_name?: string | null
          location?: string[] | null
          preferred_hours_per_week?: number | null
          preferred_name?: string | null
          user_id?: string | null
        }
        Relationships: []
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
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
