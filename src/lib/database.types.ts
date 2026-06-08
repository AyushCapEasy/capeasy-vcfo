// database.types.ts — GENERATED from the live capeasy-vcfo schema.
// Source of truth: Postgres @ db.rsaztdwxrzgyxkvxrqrt (ref rsaztdwxrzgyxkvxrqrt).
// Regenerate after every migration:  node scripts/gen-types.mjs > src/lib/database.types.ts
// (Direct introspection over DATABASE_URL — no supabase link / token, Build Plan §5.)
// Do not edit by hand.

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
      account_categories: {
        Row: {
          id: string
          code: string
          name: string
          group: Database["public"]["Enums"]["account_group"]
          statement: Database["public"]["Enums"]["statement_kind"]
          normal_balance: Database["public"]["Enums"]["normal_balance"]
          sort_order: number
        }
        Insert: {
          id?: string
          code: string
          name: string
          group: Database["public"]["Enums"]["account_group"]
          statement: Database["public"]["Enums"]["statement_kind"]
          normal_balance: Database["public"]["Enums"]["normal_balance"]
          sort_order?: number
        }
        Update: {
          id?: string
          code?: string
          name?: string
          group?: Database["public"]["Enums"]["account_group"]
          statement?: Database["public"]["Enums"]["statement_kind"]
          normal_balance?: Database["public"]["Enums"]["normal_balance"]
          sort_order?: number
        }
        Relationships: []
      }
      account_mappings: {
        Row: {
          id: string
          org_id: string
          source_account_code: string
          source_account_name: string | null
          category_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          source_account_code: string
          source_account_name?: string | null
          category_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          source_account_code?: string
          source_account_name?: string | null
          category_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          org_id: string | null
          actor_id: string | null
          action: string
          target_table: string | null
          target_id: string | null
          detail: Json
          created_at: string
        }
        Insert: {
          id?: string
          org_id?: string | null
          actor_id?: string | null
          action: string
          target_table?: string | null
          target_id?: string | null
          detail?: Json
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string | null
          actor_id?: string | null
          action?: string
          target_table?: string | null
          target_id?: string | null
          detail?: Json
          created_at?: string
        }
        Relationships: []
      }
      org_members: {
        Row: {
          org_id: string
          user_id: string
          role: Database["public"]["Enums"]["org_role"]
          created_at: string
        }
        Insert: {
          org_id: string
          user_id: string
          role?: Database["public"]["Enums"]["org_role"]
          created_at?: string
        }
        Update: {
          org_id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          created_at?: string
        }
        Relationships: []
      }
      orgs: {
        Row: {
          id: string
          legal_name: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          state: string | null
          currency: string
          gst_scheme: string | null
          has_employees: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          legal_name: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          state?: string | null
          currency?: string
          gst_scheme?: string | null
          has_employees?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          legal_name?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          state?: string | null
          currency?: string
          gst_scheme?: string | null
          has_employees?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      periods: {
        Row: {
          id: string
          org_id: string
          tax_year: string
          period_month: string
          label: string | null
          prior_period_id: string | null
          status: Database["public"]["Enums"]["period_status"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          tax_year: string
          period_month: string
          label?: string | null
          prior_period_id?: string | null
          status?: Database["public"]["Enums"]["period_status"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          tax_year?: string
          period_month?: string
          label?: string | null
          prior_period_id?: string | null
          status?: Database["public"]["Enums"]["period_status"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          full_name: string | null
          email: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          email?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          email?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_ap_aging: {
        Row: {
          id: string
          period_id: string
          org_id: string
          vendor_name: string
          current_0_30: number
          days_31_60: number
          days_61_90: number
          days_90_plus: number
          created_at: string
        }
        Insert: {
          id?: string
          period_id: string
          org_id: string
          vendor_name: string
          current_0_30?: number
          days_31_60?: number
          days_61_90?: number
          days_90_plus?: number
          created_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          org_id?: string
          vendor_name?: string
          current_0_30?: number
          days_31_60?: number
          days_61_90?: number
          days_90_plus?: number
          created_at?: string
        }
        Relationships: []
      }
      schedule_ar_aging: {
        Row: {
          id: string
          period_id: string
          org_id: string
          customer_name: string
          current_0_30: number
          days_31_60: number
          days_61_90: number
          days_90_plus: number
          created_at: string
        }
        Insert: {
          id?: string
          period_id: string
          org_id: string
          customer_name: string
          current_0_30?: number
          days_31_60?: number
          days_61_90?: number
          days_90_plus?: number
          created_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          org_id?: string
          customer_name?: string
          current_0_30?: number
          days_31_60?: number
          days_61_90?: number
          days_90_plus?: number
          created_at?: string
        }
        Relationships: []
      }
      schedule_capex: {
        Row: {
          id: string
          period_id: string
          org_id: string
          description: string | null
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          period_id: string
          org_id: string
          description?: string | null
          amount?: number
          created_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          org_id?: string
          description?: string | null
          amount?: number
          created_at?: string
        }
        Relationships: []
      }
      schedule_cash_balances: {
        Row: {
          id: string
          period_id: string
          org_id: string
          bank_name: string
          balance: number
          created_at: string
        }
        Insert: {
          id?: string
          period_id: string
          org_id: string
          bank_name: string
          balance?: number
          created_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          org_id?: string
          bank_name?: string
          balance?: number
          created_at?: string
        }
        Relationships: []
      }
      schedule_debt: {
        Row: {
          id: string
          period_id: string
          org_id: string
          lender: string | null
          kind: string | null
          principal_outstanding: number
          interest_rate: number | null
          created_at: string
        }
        Insert: {
          id?: string
          period_id: string
          org_id: string
          lender?: string | null
          kind?: string | null
          principal_outstanding?: number
          interest_rate?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          org_id?: string
          lender?: string | null
          kind?: string | null
          principal_outstanding?: number
          interest_rate?: number | null
          created_at?: string
        }
        Relationships: []
      }
      schedule_headcount: {
        Row: {
          id: string
          period_id: string
          org_id: string
          department: string | null
          headcount: number
          created_at: string
        }
        Insert: {
          id?: string
          period_id: string
          org_id: string
          department?: string | null
          headcount?: number
          created_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          org_id?: string
          department?: string | null
          headcount?: number
          created_at?: string
        }
        Relationships: []
      }
      schedule_revenue_detail: {
        Row: {
          id: string
          period_id: string
          org_id: string
          segment: string | null
          customer_name: string | null
          amount: number
          is_recurring: boolean
          created_at: string
        }
        Insert: {
          id?: string
          period_id: string
          org_id: string
          segment?: string | null
          customer_name?: string | null
          amount?: number
          is_recurring?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          org_id?: string
          segment?: string | null
          customer_name?: string | null
          amount?: number
          is_recurring?: boolean
          created_at?: string
        }
        Relationships: []
      }
      schema_migrations: {
        Row: {
          filename: string
          checksum: string
          applied_at: string
        }
        Insert: {
          filename: string
          checksum: string
          applied_at?: string
        }
        Update: {
          filename?: string
          checksum?: string
          applied_at?: string
        }
        Relationships: []
      }
      tb_upload_staging: {
        Row: {
          id: string
          period_id: string
          org_id: string
          filename: string | null
          raw_grid: Json
          column_override: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          period_id: string
          org_id: string
          filename?: string | null
          raw_grid?: Json
          column_override?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          org_id?: string
          filename?: string | null
          raw_grid?: Json
          column_override?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      trial_balance_lines: {
        Row: {
          id: string
          period_id: string
          org_id: string
          source_account_code: string
          source_account_name: string | null
          debit_amount: number
          credit_amount: number
          created_at: string
        }
        Insert: {
          id?: string
          period_id: string
          org_id: string
          source_account_code: string
          source_account_name?: string | null
          debit_amount?: number
          credit_amount?: number
          created_at?: string
        }
        Update: {
          id?: string
          period_id?: string
          org_id?: string
          source_account_code?: string
          source_account_name?: string | null
          debit_amount?: number
          credit_amount?: number
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: {
      account_group: "income" | "direct_costs" | "operating_expenses" | "below_the_line" | "current_assets" | "non_current_assets" | "current_liabilities" | "non_current_liabilities" | "equity"
      entity_type: "pvt_ltd" | "llp" | "proprietorship" | "partnership" | "opc" | "other"
      normal_balance: "debit" | "credit"
      org_role: "admin" | "analyst"
      period_status: "draft" | "reviewed" | "locked"
      statement_kind: "pl" | "bs"
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"]
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T]
