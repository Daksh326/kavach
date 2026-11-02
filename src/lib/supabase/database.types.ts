export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_analyses: {
        Row: {
          created_at: string;
          id: string;
          input_hash: string;
          input_kind: string;
          model: string;
          result_json: NonNullable<Json>;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          input_hash: string;
          input_kind?: string;
          model: string;
          result_json: NonNullable<Json>;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          input_hash?: string;
          input_kind?: string;
          model?: string;
          result_json?: NonNullable<Json>;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_analyses_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      evidence: {
        Row: {
          file_name: string | null;
          id: string;
          mime_type: string;
          r2_key: string;
          report_id: string;
          sha256: string;
          size_bytes: number;
          uploaded_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          file_name?: string | null;
          id?: string;
          mime_type: string;
          r2_key: string;
          report_id: string;
          sha256: string;
          size_bytes: number;
          uploaded_at?: string;
          user_id: string;
        };
        Update: {
          file_name?: string | null;
          id?: string;
          mime_type?: string;
          r2_key?: string;
          report_id?: string;
          sha256?: string;
          size_bytes?: number;
          uploaded_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "evidence_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidence_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      flags: {
        Row: {
          created_at: string;
          details: string | null;
          flagged_by: string | null;
          id: string;
          identifier_id: string;
          reason: Database["public"]["Enums"]["flag_reason"];
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database["public"]["Enums"]["flag_status"];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          details?: string | null;
          flagged_by?: string | null;
          id?: string;
          identifier_id: string;
          reason: Database["public"]["Enums"]["flag_reason"];
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["flag_status"];
        };
        Update: {
          created_at?: string;
          details?: string | null;
          flagged_by?: string | null;
          id?: string;
          identifier_id?: string;
          reason?: Database["public"]["Enums"]["flag_reason"];
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["flag_status"];
        };
        Relationships: [
          {
            foreignKeyName: "flags_flagged_by_fkey";
            columns: ["flagged_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flags_identifier_id_fkey";
            columns: ["identifier_id"];
            isOneToOne: false;
            referencedRelation: "identifiers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flags_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      identifiers: {
        Row: {
          created_at: string;
          distinct_reporter_count: number;
          first_seen: string;
          hidden: boolean;
          id: string;
          last_seen: string;
          merged_into_id: string | null;
          report_count: number;
          type: Database["public"]["Enums"]["identifier_type"];
          updated_at: string;
          value_normalized: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          distinct_reporter_count?: number;
          first_seen?: string;
          hidden?: boolean;
          id?: string;
          last_seen?: string;
          merged_into_id?: string | null;
          report_count?: number;
          type: Database["public"]["Enums"]["identifier_type"];
          updated_at?: string;
          value_normalized: string;
        };
        Update: {
          created_at?: string;
          distinct_reporter_count?: number;
          first_seen?: string;
          hidden?: boolean;
          id?: string;
          last_seen?: string;
          merged_into_id?: string | null;
          report_count?: number;
          type?: Database["public"]["Enums"]["identifier_type"];
          updated_at?: string;
          value_normalized?: string;
        };
        Relationships: [
          {
            foreignKeyName: "identifiers_merged_into_id_fkey";
            columns: ["merged_into_id"];
            isOneToOne: false;
            referencedRelation: "identifiers";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          id: string;
          language: Database["public"]["Enums"]["app_language"];
          name: string | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id: string;
          language?: Database["public"]["Enums"]["app_language"];
          name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          language?: Database["public"]["Enums"]["app_language"];
          name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      r2_deletion_queue: {
        Row: {
          attempts: number;
          last_error: string | null;
          queued_at: string;
          r2_key: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          last_error?: string | null;
          queued_at?: string;
          r2_key: string;
        };
        Update: {
          attempts?: number;
          last_error?: string | null;
          queued_at?: string;
          r2_key?: string;
        };
        Relationships: [];
      };
      report_identifiers: {
        Row: {
          created_at: string;
          identifier_id: string;
          report_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          identifier_id: string;
          report_id: string;
        };
        Update: {
          created_at?: string;
          identifier_id?: string;
          report_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_identifiers_identifier_id_fkey";
            columns: ["identifier_id"];
            isOneToOne: false;
            referencedRelation: "identifiers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_identifiers_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          amount_lost: number | null;
          bank_account_last4: string | null;
          category: Database["public"]["Enums"]["scam_category"];
          channel: Database["public"]["Enums"]["report_channel"];
          consent_at: string;
          consent_version: string;
          created_at: string;
          description: string;
          id: string;
          incident_date: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          status: Database["public"]["Enums"]["report_status"];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_lost?: number | null;
          bank_account_last4?: string | null;
          category: Database["public"]["Enums"]["scam_category"];
          channel: Database["public"]["Enums"]["report_channel"];
          consent_at: string;
          consent_version: string;
          created_at?: string;
          description?: string;
          id?: string;
          incident_date?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          status?: Database["public"]["Enums"]["report_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount_lost?: number | null;
          bank_account_last4?: string | null;
          category?: Database["public"]["Enums"]["scam_category"];
          channel?: Database["public"]["Enums"]["report_channel"];
          consent_at?: string;
          consent_version?: string;
          created_at?: string;
          description?: string;
          id?: string;
          incident_date?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          status?: Database["public"]["Enums"]["report_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_merge_identifiers: {
        Args: { p_source_id: string; p_target_id: string };
        Returns: undefined;
      };
      cron_heartbeat: { Args: Record<PropertyKey, never>; Returns: Json };
      flag_identifier: {
        Args: {
          p_details: string;
          p_flagged_by: string;
          p_reason: Database["public"]["Enums"]["flag_reason"];
          p_type: Database["public"]["Enums"]["identifier_type"];
          p_value: string;
        };
        Returns: string;
      };
      lookup_identifier: {
        Args: { p_type: Database["public"]["Enums"]["identifier_type"]; p_value: string };
        Returns: {
          categories: Database["public"]["Enums"]["scam_category"][];
          channels: Database["public"]["Enums"]["report_channel"][];
          first_seen: string;
          is_reported: boolean;
          last_seen: string;
          reporter_count: number;
          type: Database["public"]["Enums"]["identifier_type"];
          value_normalized: string;
        }[];
      };
      search_identifiers: {
        Args: {
          p_limit?: number;
          p_query: string;
          p_type?: Database["public"]["Enums"]["identifier_type"];
        };
        Returns: {
          reporter_count: number;
          similarity: number;
          type: Database["public"]["Enums"]["identifier_type"];
          value_normalized: string;
        }[];
      };
      submit_report: {
        Args: { p_identifiers: Json; p_report: Json; p_user_id: string };
        Returns: string;
      };
    };
    Enums: {
      app_language: "en" | "hi";
      flag_reason: "wrong_number" | "my_identifier" | "abusive" | "duplicate" | "other";
      flag_status: "open" | "dismissed" | "actioned";
      identifier_type: "phone" | "upi" | "url" | "domain" | "email" | "social" | "bank_ifsc";
      payment_method:
        | "upi"
        | "bank_transfer"
        | "debit_card"
        | "credit_card"
        | "wallet"
        | "net_banking"
        | "cash"
        | "crypto"
        | "gift_card"
        | "other"
        | "none";
      report_channel:
        | "phone_call"
        | "sms"
        | "whatsapp"
        | "telegram"
        | "email"
        | "social_media"
        | "website"
        | "app"
        | "in_person"
        | "other";
      report_status: "draft" | "filed_1930" | "filed_portal" | "bank_contacted" | "resolved";
      scam_category:
        | "upi_collect_request"
        | "fake_customer_care"
        | "kyc_bank_impersonation"
        | "digital_arrest"
        | "investment_trading"
        | "task_job_scam"
        | "loan_app"
        | "sextortion"
        | "online_shopping"
        | "lottery_prize"
        | "romance"
        | "utility_bill"
        | "otp_sim_swap"
        | "phishing_link"
        | "other";
      user_role: "user" | "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_language: ["en", "hi"],
      flag_reason: ["wrong_number", "my_identifier", "abusive", "duplicate", "other"],
      flag_status: ["open", "dismissed", "actioned"],
      identifier_type: ["phone", "upi", "url", "domain", "email", "social", "bank_ifsc"],
      payment_method: [
        "upi",
        "bank_transfer",
        "debit_card",
        "credit_card",
        "wallet",
        "net_banking",
        "cash",
        "crypto",
        "gift_card",
        "other",
        "none",
      ],
      report_channel: [
        "phone_call",
        "sms",
        "whatsapp",
        "telegram",
        "email",
        "social_media",
        "website",
        "app",
        "in_person",
        "other",
      ],
      report_status: ["draft", "filed_1930", "filed_portal", "bank_contacted", "resolved"],
      scam_category: [
        "upi_collect_request",
        "fake_customer_care",
        "kyc_bank_impersonation",
        "digital_arrest",
        "investment_trading",
        "task_job_scam",
        "loan_app",
        "sextortion",
        "online_shopping",
        "lottery_prize",
        "romance",
        "utility_bill",
        "otp_sim_swap",
        "phishing_link",
        "other",
      ],
      user_role: ["user", "admin"],
    },
  },
} as const;
