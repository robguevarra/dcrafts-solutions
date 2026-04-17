/**
 * Dcrafts Platform — Auto-generated Supabase Database Types
 * Generated from: qgonuztynqabujtamorm.supabase.co
 * Re-generate with: supabase gen types typescript --project-id qgonuztynqabujtamorm
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      conversations: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          is_escalated: boolean
          last_activity_at: string
          order_id: string | null
          platform_conversation_id: string
          spec_draft: Json | null
          spec_step: string | null
          state: Database["public"]["Enums"]["conversation_state"]
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          is_escalated?: boolean
          last_activity_at?: string
          order_id?: string | null
          platform_conversation_id: string
          spec_draft?: Json | null
          spec_step?: string | null
          state?: Database["public"]["Enums"]["conversation_state"]
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          is_escalated?: boolean
          last_activity_at?: string
          order_id?: string | null
          platform_conversation_id?: string
          spec_draft?: Json | null
          spec_step?: string | null
          state?: Database["public"]["Enums"]["conversation_state"]
        }
        Relationships: [
          {
            foreignKeyName: "conversations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          suggested_reply: string | null
          was_sent: boolean
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          suggested_reply?: string | null
          was_sent?: boolean
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          suggested_reply?: string | null
          was_sent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string | null
          buyer_name: string | null
          buyer_phone: string | null
          created_at: string
          id: string
          platform: Database["public"]["Enums"]["order_platform"]
          platform_order_id: string
          raw_payload: Json
          shadow_mode: boolean
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          buyer_id?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          created_at?: string
          id?: string
          platform: Database["public"]["Enums"]["order_platform"]
          platform_order_id: string
          raw_payload?: Json
          shadow_mode?: boolean
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          buyer_id?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          created_at?: string
          id?: string
          platform?: Database["public"]["Enums"]["order_platform"]
          platform_order_id?: string
          raw_payload?: Json
          shadow_mode?: boolean
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: []
      }
      pre_order_intents: {
        Row: {
          color_name: string | null
          created_at: string
          font_name: string | null
          id: string
          letter_case: string | null
          letters_text: string | null
          linked_order_id: string | null
          size_cm: number | null
          tiktok_user_id: string
        }
        Insert: {
          color_name?: string | null
          created_at?: string
          font_name?: string | null
          id?: string
          letter_case?: string | null
          letters_text?: string | null
          linked_order_id?: string | null
          size_cm?: number | null
          tiktok_user_id: string
        }
        Update: {
          color_name?: string | null
          created_at?: string
          font_name?: string | null
          id?: string
          letter_case?: string | null
          letters_text?: string | null
          linked_order_id?: string | null
          size_cm?: number | null
          tiktok_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_order_intents_linked_order_id_fkey"
            columns: ["linked_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          created_at: string
          designer_id: string | null
          id: string
          order_id: string
          proof_photo_url: string | null
          proof_sent_at: string | null
          status: Database["public"]["Enums"]["print_job_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          designer_id?: string | null
          id?: string
          order_id: string
          proof_photo_url?: string | null
          proof_sent_at?: string | null
          status?: Database["public"]["Enums"]["print_job_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          designer_id?: string | null
          id?: string
          order_id?: string
          proof_photo_url?: string | null
          proof_sent_at?: string | null
          status?: Database["public"]["Enums"]["print_job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      print_specs: {
        Row: {
          color_name: string | null
          confirmed_at: string | null
          created_at: string
          font_name: string | null
          id: string
          letter_case: string | null
          letters_text: string | null
          order_id: string
          quantity: number
          size_cm: number | null
        }
        Insert: {
          color_name?: string | null
          confirmed_at?: string | null
          created_at?: string
          font_name?: string | null
          id?: string
          letter_case?: string | null
          letters_text?: string | null
          order_id: string
          quantity?: number
          size_cm?: number | null
        }
        Update: {
          color_name?: string | null
          confirmed_at?: string | null
          created_at?: string
          font_name?: string | null
          id?: string
          letter_case?: string | null
          letters_text?: string | null
          order_id?: string
          quantity?: number
          size_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "print_specs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_logs: {
        Row: {
          created_at: string
          id: string
          message: string
          order_id: string
          phone: string
          semaphore_message_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          order_id: string
          phone: string
          semaphore_message_id?: string | null
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          order_id?: string
          phone?: string
          semaphore_message_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      conversation_state:
        | "new"
        | "pre_order_faq"
        | "pre_order_spec"
        | "post_order_spec"
        | "order_confirmation"
        | "human_handoff"
        | "resolved"
      order_platform: "tiktok" | "shopee"
      order_status:
        | "pending_spec"
        | "spec_collected"
        | "in_production"
        | "qc_upload"
        | "shipped"
        | "cancelled"
      print_job_status: "queued" | "in_progress" | "done"
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

// ── Convenience row-level type aliases ───────────────────────

export type Order         = Database["public"]["Tables"]["orders"]["Row"]
export type PrintSpec     = Database["public"]["Tables"]["print_specs"]["Row"]
export type PrintJob      = Database["public"]["Tables"]["print_jobs"]["Row"]
export type Conversation  = Database["public"]["Tables"]["conversations"]["Row"]
export type Message       = Database["public"]["Tables"]["messages"]["Row"]
export type SmsLog        = Database["public"]["Tables"]["sms_logs"]["Row"]
export type FeatureFlag   = Database["public"]["Tables"]["feature_flags"]["Row"]
export type PreOrderIntent = Database["public"]["Tables"]["pre_order_intents"]["Row"]

export const Constants = {
  public: {
    Enums: {
      conversation_state: [
        "new",
        "pre_order_faq",
        "pre_order_spec",
        "post_order_spec",
        "order_confirmation",
        "human_handoff",
        "resolved",
      ],
      order_platform: ["tiktok", "shopee"],
      order_status: [
        "pending_spec",
        "spec_collected",
        "in_production",
        "qc_upload",
        "shipped",
        "cancelled",
      ],
      print_job_status: ["queued", "in_progress", "done"],
    },
  },
} as const
