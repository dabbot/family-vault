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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          icon: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          icon: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          icon?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          citations: Json | null
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          citations?: Json | null
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          citations?: Json | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      document_shares: {
        Row: {
          created_at: string
          document_id: string
          expires_at: string | null
          id: string
          last_viewed_at: string | null
          owner_id: string
          revoked_at: string | null
          token: string
          view_count: number
        }
        Insert: {
          created_at?: string
          document_id: string
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          owner_id: string
          revoked_at?: string | null
          token: string
          view_count?: number
        }
        Update: {
          created_at?: string
          document_id?: string
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          owner_id?: string
          revoked_at?: string | null
          token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_shares_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          created_at: string
          document_id: string
          id: string
          mime_type: string | null
          owner_id: string
          size_bytes: number | null
          storage_path: string
          version_no: number
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          mime_type?: string | null
          owner_id: string
          size_bytes?: number | null
          storage_path: string
          version_no: number
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          mime_type?: string | null
          owner_id?: string
          size_bytes?: number | null
          storage_path?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          ai_processed: boolean
          ai_summary: string | null
          category_id: string | null
          created_at: string
          deleted_at: string | null
          doc_number: string | null
          doc_type: string | null
          remote_file_id: string | null
          expiry_date: string | null
          family_slot: string
          folder_id: string | null
          id: string
          is_favorite: boolean
          is_private: boolean
          issue_date: string | null
          issuer: string | null
          member_name: string | null
          mime_type: string | null
          needs_review: boolean
          notes: string | null
          ocr_text: string | null
          owner_id: string
          size_bytes: number | null
          snoozed_until: string | null
          source: string
          storage_path: string
          title: string
          updated_at: string
        }
        Insert: {
          ai_processed?: boolean
          ai_summary?: string | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          doc_number?: string | null
          doc_type?: string | null
          remote_file_id?: string | null
          expiry_date?: string | null
          family_slot?: string
          folder_id?: string | null
          id?: string
          is_favorite?: boolean
          is_private?: boolean
          issue_date?: string | null
          issuer?: string | null
          member_name?: string | null
          mime_type?: string | null
          needs_review?: boolean
          notes?: string | null
          ocr_text?: string | null
          owner_id: string
          size_bytes?: number | null
          snoozed_until?: string | null
          source?: string
          storage_path: string
          title: string
          updated_at?: string
        }
        Update: {
          ai_processed?: boolean
          ai_summary?: string | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          doc_number?: string | null
          doc_type?: string | null
          remote_file_id?: string | null
          expiry_date?: string | null
          family_slot?: string
          folder_id?: string | null
          id?: string
          is_favorite?: boolean
          is_private?: boolean
          issue_date?: string | null
          issuer?: string | null
          member_name?: string | null
          mime_type?: string | null
          needs_review?: boolean
          notes?: string | null
          ocr_text?: string | null
          owner_id?: string
          size_bytes?: number | null
          snoozed_until?: string | null
          source?: string
          storage_path?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          created_at: string
          email: string | null
          kind: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          kind?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          kind?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      family_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      family_settings: {
        Row: {
          family_alias: string
          id: boolean
          updated_at: string
        }
        Insert: {
          family_alias: string
          id?: boolean
          updated_at?: string
        }
        Update: {
          family_alias?: string
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      folders: {
        Row: {
          created_at: string
          created_by: string
          family_slot: string
          id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          family_slot: string
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          family_slot?: string
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_tokens: {
        Row: {
          access_token: string | null
          calendar_id: string | null
          created_at: string
          expires_at: string | null
          google_email: string | null
          id: string
          refresh_token: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          calendar_id?: string | null
          created_at?: string
          expires_at?: string | null
          google_email?: string | null
          id?: string
          refresh_token: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          calendar_id?: string | null
          created_at?: string
          expires_at?: string | null
          google_email?: string | null
          id?: string
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inbound_events: {
        Row: {
          alias: string | null
          created_at: string
          document_id: string | null
          error: string | null
          id: string
          matched_owner: string | null
          processed_at: string | null
          raw_payload: Json | null
          status: string
        }
        Insert: {
          alias?: string | null
          created_at?: string
          document_id?: string | null
          error?: string | null
          id?: string
          matched_owner?: string | null
          processed_at?: string | null
          raw_payload?: Json | null
          status?: string
        }
        Update: {
          alias?: string | null
          created_at?: string
          document_id?: string | null
          error?: string | null
          id?: string
          matched_owner?: string | null
          processed_at?: string | null
          raw_payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_payments: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          next_due_date: string | null
          note: string | null
          owner_id: string
          paid_on: string
          policy_id: string
          previous_due_date: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          next_due_date?: string | null
          note?: string | null
          owner_id: string
          paid_on?: string
          policy_id: string
          previous_due_date?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          next_due_date?: string | null
          note?: string | null
          owner_id?: string
          paid_on?: string
          policy_id?: string
          previous_due_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_payments_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_policies: {
        Row: {
          created_at: string
          family_slot: string | null
          id: string
          maturity_amount: number | null
          maturity_date: string | null
          maturity_note: string | null
          maturity_received_at: string | null
          member_name: string | null
          notes: string | null
          owner_id: string
          policy_name: string
          policy_number: string | null
          policy_type: string | null
          premium_amount: number | null
          premium_due_date: string | null
          premium_frequency: string | null
          provider: string | null
          source_document_id: string | null
          start_date: string | null
          sum_assured: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          family_slot?: string | null
          id?: string
          maturity_amount?: number | null
          maturity_date?: string | null
          maturity_note?: string | null
          maturity_received_at?: string | null
          member_name?: string | null
          notes?: string | null
          owner_id: string
          policy_name: string
          policy_number?: string | null
          policy_type?: string | null
          premium_amount?: number | null
          premium_due_date?: string | null
          premium_frequency?: string | null
          provider?: string | null
          source_document_id?: string | null
          start_date?: string | null
          sum_assured?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          family_slot?: string | null
          id?: string
          maturity_amount?: number | null
          maturity_date?: string | null
          maturity_note?: string | null
          maturity_received_at?: string | null
          member_name?: string | null
          notes?: string | null
          owner_id?: string
          policy_name?: string
          policy_number?: string | null
          policy_type?: string | null
          premium_amount?: number | null
          premium_due_date?: string | null
          premium_frequency?: string | null
          provider?: string | null
          source_document_id?: string | null
          start_date?: string | null
          sum_assured?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_policies_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          inbound_alias: string | null
          inbound_from_emails: string[]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          inbound_alias?: string | null
          inbound_from_emails?: string[]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          inbound_alias?: string | null
          inbound_from_emails?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          document_id: string
          fires_at: string
          id: string
          kind: string
          owner_id: string
          sent_at: string | null
        }
        Insert: {
          created_at?: string
          document_id: string
          fires_at: string
          id?: string
          kind: string
          owner_id: string
          sent_at?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string
          fires_at?: string
          id?: string
          kind?: string
          owner_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_connections: {
        Row: {
          id: number
          provider: string
          account_label: string | null
          refresh_token_enc: string
          access_token_enc: string | null
          access_expires_at: string | null
          root_folder_id: string | null
          cursor: string | null
          last_synced_at: string | null
          last_error: string | null
          connected_by: string | null
          connected_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          provider: string
          account_label?: string | null
          refresh_token_enc: string
          access_token_enc?: string | null
          access_expires_at?: string | null
          root_folder_id?: string | null
          cursor?: string | null
          last_synced_at?: string | null
          last_error?: string | null
          connected_by?: string | null
          connected_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          provider?: string
          account_label?: string | null
          refresh_token_enc?: string
          access_token_enc?: string | null
          access_expires_at?: string | null
          root_folder_id?: string | null
          cursor?: string | null
          last_synced_at?: string | null
          last_error?: string | null
          connected_by?: string | null
          connected_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      synced_calendar_events: {
        Row: {
          calendar_id: string
          created_at: string
          event_date: string
          google_event_id: string
          id: string
          last_synced_at: string
          source_id: string
          source_kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_id?: string
          created_at?: string
          event_date: string
          google_event_id: string
          id?: string
          last_synced_at?: string
          source_id: string
          source_kind: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          event_date?: string
          google_event_id?: string
          id?: string
          last_synced_at?: string
          source_id?: string
          source_kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_family_member: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "member"
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
    Enums: {
      app_role: ["admin", "member"],
    },
  },
} as const
