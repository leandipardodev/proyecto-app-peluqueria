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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_allowlist: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          role: string
          shop_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          role?: string
          shop_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          role?: string
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_allowlist_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          payload: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      appointments: {
        Row: {
          created_at: string | null
          customer_id: string | null
          date_key_ar: string | null
          deposit_amount: number | null
          end_time: string
          id: string
          is_paid: boolean | null
          loyalty_discount_percent_applied: number
          loyalty_reward_applied: boolean
          mp_preference_id: string | null
          notes: string | null
          recurring_group_id: string | null
          service_id: string | null
          service_price: number | null
          shop_id: string
          staff_id: string | null
          start_time: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          date_key_ar?: string | null
          deposit_amount?: number | null
          end_time: string
          id?: string
          is_paid?: boolean | null
          loyalty_discount_percent_applied?: number
          loyalty_reward_applied?: boolean
          mp_preference_id?: string | null
          notes?: string | null
          recurring_group_id?: string | null
          service_id?: string | null
          service_price?: number | null
          shop_id: string
          staff_id?: string | null
          start_time: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          date_key_ar?: string | null
          deposit_amount?: number | null
          end_time?: string
          id?: string
          is_paid?: boolean | null
          loyalty_discount_percent_applied?: number
          loyalty_reward_applied?: boolean
          mp_preference_id?: string | null
          notes?: string | null
          recurring_group_id?: string | null
          service_id?: string | null
          service_price?: number | null
          shop_id?: string
          staff_id?: string | null
          start_time?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          appointment_id: string | null
          cash_session_id: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          happened_at: string
          id: string
          movement_type: string
          payment_method: string
          shop_id: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          cash_session_id?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          happened_at?: string
          id?: string
          movement_type: string
          payment_method: string
          shop_id: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          cash_session_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          happened_at?: string
          id?: string
          movement_type?: string
          payment_method?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          close_notes: string | null
          closed_at: string | null
          closed_by: string | null
          counted_amount: number | null
          created_at: string
          difference_amount: number | null
          expected_amount: number | null
          id: string
          opened_at: string
          opened_by: string
          opening_amount: number
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          close_notes?: string | null
          closed_at?: string | null
          closed_by?: string | null
          counted_amount?: number | null
          created_at?: string
          difference_amount?: number | null
          expected_amount?: number | null
          id?: string
          opened_at?: string
          opened_by: string
          opening_amount?: number
          shop_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          close_notes?: string | null
          closed_at?: string | null
          closed_by?: string | null
          counted_amount?: number | null
          created_at?: string
          difference_amount?: number | null
          expected_amount?: number | null
          id?: string
          opened_at?: string
          opened_by?: string
          opening_amount?: number
          shop_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_services: {
        Row: {
          combo_id: string
          created_at: string
          id: string
          service_id: string
        }
        Insert: {
          combo_id: string
          created_at?: string
          id?: string
          service_id: string
        }
        Update: {
          combo_id?: string
          created_at?: string
          id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "combo_services_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      combos: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          name: string
          price: number
          shop_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          name: string
          price?: number
          shop_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          name?: string
          price?: number
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "combos_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string | null
          cumplea├▒os: string | null
          email: string | null
          es_vip: boolean | null
          id: string
          localidad: string | null
          loyalty_cuts_count: number
          loyalty_rewards_available: number
          nombre: string
          observaciones_tecnicas: string | null
          recurring_frequency: string | null
          recurring_notes: string | null
          recurring_weekday: number | null
          shop_id: string
          tags: string[]
          telefono: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          cumplea├▒os?: string | null
          email?: string | null
          es_vip?: boolean | null
          id?: string
          localidad?: string | null
          loyalty_cuts_count?: number
          loyalty_rewards_available?: number
          nombre: string
          observaciones_tecnicas?: string | null
          recurring_frequency?: string | null
          recurring_notes?: string | null
          recurring_weekday?: number | null
          shop_id: string
          tags?: string[]
          telefono?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          cumplea├▒os?: string | null
          email?: string | null
          es_vip?: boolean | null
          id?: string
          localidad?: string | null
          loyalty_cuts_count?: number
          loyalty_rewards_available?: number
          nombre?: string
          observaciones_tecnicas?: string | null
          recurring_frequency?: string | null
          recurring_notes?: string | null
          recurring_weekday?: number | null
          shop_id?: string
          tags?: string[]
          telefono?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      email_verifications: {
        Row: {
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          verified_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          verified_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      finances: {
        Row: {
          amount: number
          appointment_id: string | null
          category: string
          created_at: string | null
          description: string | null
          happened_at: string | null
          id: string
          shop_id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          category: string
          created_at?: string | null
          description?: string | null
          happened_at?: string | null
          id?: string
          shop_id: string
          type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          category?: string
          created_at?: string | null
          description?: string | null
          happened_at?: string | null
          id?: string
          shop_id?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finances_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finances_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      industry_config: {
        Row: {
          features: Json
          industry: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          features?: Json
          industry: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          features?: Json
          industry?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      leads_global: {
        Row: {
          created_at: string | null
          email: string | null
          estado: string | null
          id: string
          nombre: string
          origen: string | null
          shop_id: string | null
          telefono: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          estado?: string | null
          id?: string
          nombre: string
          origen?: string | null
          shop_id?: string | null
          telefono?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          estado?: string | null
          id?: string
          nombre?: string
          origen?: string | null
          shop_id?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_global_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadopago_logs: {
        Row: {
          appointment_id: string | null
          created_at: string | null
          event_type: string
          id: string
          mp_preference_id: string | null
          payload: Json | null
          shop_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          mp_preference_id?: string | null
          payload?: Json | null
          shop_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          mp_preference_id?: string | null
          payload?: Json | null
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mercadopago_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mercadopago_logs_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_bookings: {
        Row: {
          authenticated_user_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          deposit_amount: number | null
          end_time: string
          expires_at: string
          id: string
          mp_preference_id: string | null
          service_id: string
          shop_id: string
          staff_id: string | null
          start_time: string
          status: string
        }
        Insert: {
          authenticated_user_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          deposit_amount?: number | null
          end_time: string
          expires_at?: string
          id?: string
          mp_preference_id?: string | null
          service_id: string
          shop_id: string
          staff_id?: string | null
          start_time: string
          status?: string
        }
        Update: {
          authenticated_user_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          deposit_amount?: number | null
          end_time?: string
          expires_at?: string
          id?: string
          mp_preference_id?: string | null
          service_id?: string
          shop_id?: string
          staff_id?: string | null
          start_time?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_bookings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      product_event_markers: {
        Row: {
          created_at: string
          id: string
          marker_key: string
          shop_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          marker_key: string
          shop_id: string
        }
        Update: {
          created_at?: string
          id?: string
          marker_key?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_event_markers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      product_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          shop_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          shop_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_attributions: {
        Row: {
          attributed_at: string
          commission_months_snapshot: number
          commission_percent_snapshot: number
          created_at: string
          id: string
          partner_id: string
          referral_code_snapshot: string | null
          shop_id: string
        }
        Insert: {
          attributed_at?: string
          commission_months_snapshot: number
          commission_percent_snapshot: number
          created_at?: string
          id?: string
          partner_id: string
          referral_code_snapshot?: string | null
          shop_id: string
        }
        Update: {
          attributed_at?: string
          commission_months_snapshot?: number
          commission_percent_snapshot?: number
          created_at?: string
          id?: string
          partner_id?: string
          referral_code_snapshot?: string | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_attributions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_attributions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_commission_ledger: {
        Row: {
          base_amount: number
          billing_event_id: string
          commission_amount: number
          commission_percent: number
          created_at: string
          id: string
          paid_at: string | null
          partner_id: string
          payment_applied_at: string
          payment_id: string | null
          payment_sequence: number
          payout_id: string | null
          period_ym: string
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          base_amount: number
          billing_event_id: string
          commission_amount: number
          commission_percent: number
          created_at?: string
          id?: string
          paid_at?: string | null
          partner_id: string
          payment_applied_at: string
          payment_id?: string | null
          payment_sequence: number
          payout_id?: string | null
          period_ym: string
          shop_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          base_amount?: number
          billing_event_id?: string
          commission_amount?: number
          commission_percent?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          partner_id?: string
          payment_applied_at?: string
          payment_id?: string | null
          payment_sequence?: number
          payout_id?: string | null
          period_ym?: string
          shop_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_commission_ledger_billing_event_id_fkey"
            columns: ["billing_event_id"]
            isOneToOne: true
            referencedRelation: "shop_billing_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commission_ledger_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commission_ledger_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "referral_commission_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commission_ledger_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_commission_payouts: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          notes: string | null
          paid_at: string | null
          partner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          partner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          partner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_commission_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "referral_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_partners: {
        Row: {
          commission_months_override: number | null
          commission_percent_override: number | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          referral_code: string
          updated_at: string
        }
        Insert: {
          commission_months_override?: number | null
          commission_percent_override?: number | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          referral_code: string
          updated_at?: string
        }
        Update: {
          commission_months_override?: number | null
          commission_percent_override?: number | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          referral_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      referral_program_settings: {
        Row: {
          created_at: string
          default_commission_months: number
          default_commission_percent: number
          id: string
          is_default: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_commission_months?: number
          default_commission_percent?: number
          id?: string
          is_default?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_commission_months?: number
          default_commission_percent?: number
          id?: string
          is_default?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          category: string
          created_at: string | null
          description: string
          duration_minutes: number | null
          id: string
          name: string
          pay_at_shop: boolean
          price: number
          shop_id: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          description?: string
          duration_minutes?: number | null
          id?: string
          name: string
          pay_at_shop?: boolean
          price?: number
          shop_id: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string
          duration_minutes?: number | null
          id?: string
          name?: string
          pay_at_shop?: boolean
          price?: number
          shop_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_billing_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          shop_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          shop_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_billing_events_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_booking_theme: {
        Row: {
          about_text: string | null
          about_title: string | null
          created_at: string
          hero_subtitle: string | null
          hero_title: string | null
          logo_storage_path: string | null
          logo_url: string | null
          section_order: string[]
          section_service_order: string[]
          shop_id: string
          template_id: string
          updated_at: string
        }
        Insert: {
          about_text?: string | null
          about_title?: string | null
          created_at?: string
          hero_subtitle?: string | null
          hero_title?: string | null
          logo_storage_path?: string | null
          logo_url?: string | null
          section_order?: string[]
          section_service_order?: string[]
          shop_id: string
          template_id?: string
          updated_at?: string
        }
        Update: {
          about_text?: string | null
          about_title?: string | null
          created_at?: string
          hero_subtitle?: string | null
          hero_title?: string | null
          logo_storage_path?: string | null
          logo_url?: string | null
          section_order?: string[]
          section_service_order?: string[]
          shop_id?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_booking_theme_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_date_overrides: {
        Row: {
          created_at: string | null
          date: string
          end_time: string | null
          id: string
          is_closed: boolean
          reason: string | null
          shop_id: string
          staff_id: string | null
          start_time: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          end_time?: string | null
          id?: string
          is_closed?: boolean
          reason?: string | null
          shop_id: string
          staff_id?: string | null
          start_time?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          end_time?: string | null
          id?: string
          is_closed?: boolean
          reason?: string | null
          shop_id?: string
          staff_id?: string | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_date_overrides_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_date_overrides_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      shop_memberships: {
        Row: {
          created_at: string
          id: string
          invite_accepted_at: string | null
          is_active: boolean
          role: string
          shop_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_accepted_at?: string | null
          is_active?: boolean
          role?: string
          shop_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_accepted_at?: string | null
          is_active?: boolean
          role?: string
          shop_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_memberships_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          active: boolean | null
          address: string | null
          booking_deposit_amount: number
          booking_deposit_enabled: boolean
          business_hours: Json | null
          created_at: string | null
          description: string | null
          facebook_url: string | null
          features_override: Json | null
          google_maps_url: string | null
          id: string
          industry: string
          instagram_url: string | null
          localidad: string | null
          loyalty_cuts_required: number
          loyalty_discount_percent: number
          loyalty_enabled: boolean
          mp_access_token: string | null
          mp_public_key: string | null
          nombre: string
          pay_at_shop: boolean
          phone: string | null
          plan_expiry: string | null
          slug: string
          tiktok_url: string | null
          updated_at: string | null
          voucher_whatsapp_template: string | null
          whatsapp_template: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          booking_deposit_amount?: number
          booking_deposit_enabled?: boolean
          business_hours?: Json | null
          created_at?: string | null
          description?: string | null
          facebook_url?: string | null
          features_override?: Json | null
          google_maps_url?: string | null
          id?: string
          industry?: string
          instagram_url?: string | null
          localidad?: string | null
          loyalty_cuts_required?: number
          loyalty_discount_percent?: number
          loyalty_enabled?: boolean
          mp_access_token?: string | null
          mp_public_key?: string | null
          nombre: string
          pay_at_shop?: boolean
          phone?: string | null
          plan_expiry?: string | null
          slug: string
          tiktok_url?: string | null
          updated_at?: string | null
          voucher_whatsapp_template?: string | null
          whatsapp_template?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          booking_deposit_amount?: number
          booking_deposit_enabled?: boolean
          business_hours?: Json | null
          created_at?: string | null
          description?: string | null
          facebook_url?: string | null
          features_override?: Json | null
          google_maps_url?: string | null
          id?: string
          industry?: string
          instagram_url?: string | null
          localidad?: string | null
          loyalty_cuts_required?: number
          loyalty_discount_percent?: number
          loyalty_enabled?: boolean
          mp_access_token?: string | null
          mp_public_key?: string | null
          nombre?: string
          pay_at_shop?: boolean
          phone?: string | null
          plan_expiry?: string | null
          slug?: string
          tiktok_url?: string | null
          updated_at?: string | null
          voucher_whatsapp_template?: string | null
          whatsapp_template?: string | null
        }
        Relationships: []
      }
      staff_commission_overrides: {
        Row: {
          compensation_rule_id: string
          created_at: string
          fixed_amount: number | null
          id: string
          percentage_rate: number
          service_id: string
          shop_id: string
        }
        Insert: {
          compensation_rule_id: string
          created_at?: string
          fixed_amount?: number | null
          id?: string
          percentage_rate: number
          service_id: string
          shop_id: string
        }
        Update: {
          compensation_rule_id?: string
          created_at?: string
          fixed_amount?: number | null
          id?: string
          percentage_rate?: number
          service_id?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_commission_overrides_compensation_rule_id_fkey"
            columns: ["compensation_rule_id"]
            isOneToOne: false
            referencedRelation: "staff_compensation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_commission_overrides_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_commission_overrides_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_compensation_rules: {
        Row: {
          created_at: string
          created_by: string | null
          ends_on: string | null
          fixed_amount: number | null
          id: string
          is_active: boolean
          model: string
          notes: string | null
          overrides_enabled: boolean
          percentage_rate: number | null
          shop_id: string
          staff_user_id: string
          starts_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          model: string
          notes?: string | null
          overrides_enabled?: boolean
          percentage_rate?: number | null
          shop_id: string
          staff_user_id: string
          starts_on: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          model?: string
          notes?: string | null
          overrides_enabled?: boolean
          percentage_rate?: number | null
          shop_id?: string
          staff_user_id?: string
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_compensation_rules_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_liquidation_items: {
        Row: {
          appointment_id: string | null
          bonus_amount: number
          commission_amount: number
          commission_rate_snapshot: number | null
          created_at: string
          deduction_amount: number
          gross_amount: number
          id: string
          liquidation_id: string
          net_amount: number
          service_id: string | null
          service_name_snapshot: string | null
          shop_id: string
          start_time_snapshot: string | null
        }
        Insert: {
          appointment_id?: string | null
          bonus_amount?: number
          commission_amount?: number
          commission_rate_snapshot?: number | null
          created_at?: string
          deduction_amount?: number
          gross_amount?: number
          id?: string
          liquidation_id: string
          net_amount?: number
          service_id?: string | null
          service_name_snapshot?: string | null
          shop_id: string
          start_time_snapshot?: string | null
        }
        Update: {
          appointment_id?: string | null
          bonus_amount?: number
          commission_amount?: number
          commission_rate_snapshot?: number | null
          created_at?: string
          deduction_amount?: number
          gross_amount?: number
          id?: string
          liquidation_id?: string
          net_amount?: number
          service_id?: string | null
          service_name_snapshot?: string | null
          shop_id?: string
          start_time_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_liquidation_items_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_liquidation_items_liquidation_id_fkey"
            columns: ["liquidation_id"]
            isOneToOne: false
            referencedRelation: "staff_liquidations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_liquidation_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_liquidation_items_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_liquidations: {
        Row: {
          bonuses_amount: number
          commission_amount: number
          created_at: string
          created_by: string | null
          deductions_amount: number
          final_payable: number
          gross_revenue: number
          id: string
          notes: string | null
          paid_amount: number
          paid_at: string | null
          paid_by: string | null
          period_end: string
          period_start: string
          shop_id: string
          staff_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          bonuses_amount?: number
          commission_amount?: number
          created_at?: string
          created_by?: string | null
          deductions_amount?: number
          final_payable?: number
          gross_revenue?: number
          id?: string
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          paid_by?: string | null
          period_end: string
          period_start: string
          shop_id: string
          staff_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          bonuses_amount?: number
          commission_amount?: number
          created_at?: string
          created_by?: string | null
          deductions_amount?: number
          final_payable?: number
          gross_revenue?: number
          id?: string
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          paid_by?: string | null
          period_end?: string
          period_start?: string
          shop_id?: string
          staff_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_liquidations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          created_at: string
          description: string | null
          instagram: string | null
          photo_url: string | null
          updated_at: string | null
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          instagram?: string | null
          photo_url?: string | null
          updated_at?: string | null
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          instagram?: string | null
          photo_url?: string | null
          updated_at?: string | null
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      staff_schedules: {
        Row: {
          break_end: string | null
          break_start: string | null
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          staff_id: string
          start_time: string
          updated_at: string | null
        }
        Insert: {
          break_end?: string | null
          break_start?: string | null
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          staff_id: string
          start_time: string
          updated_at?: string | null
        }
        Update: {
          break_end?: string | null
          break_start?: string | null
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          staff_id?: string
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_schedules_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      staff_services: {
        Row: {
          created_at: string
          id: string
          service_id: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          service_id: string
          staff_id: string
        }
        Update: {
          created_at?: string
          id?: string
          service_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      stock: {
        Row: {
          created_at: string | null
          id: string
          nombre_producto: string
          quantity: number | null
          shop_id: string
          unit_cost: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          nombre_producto: string
          quantity?: number | null
          shop_id: string
          unit_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nombre_producto?: string
          quantity?: number | null
          shop_id?: string
          unit_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string | null
          email: string | null
          is_active: boolean | null
          name: string | null
          nombre: string | null
          platform_role: string
          role: string | null
          shop_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          is_active?: boolean | null
          name?: string | null
          nombre?: string | null
          platform_role?: string
          role?: string | null
          shop_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          is_active?: boolean | null
          name?: string | null
          nombre?: string | null
          platform_role?: string
          role?: string | null
          shop_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          created_at: string
          customer_id: string | null
          gifted_by_name: string | null
          gifted_to_birthday: string
          gifted_to_name: string
          gifted_to_phone: string | null
          id: string
          redeemed_at: string | null
          reminder_sent_at: string | null
          service_name: string
          shop_id: string
          status: string
          updated_at: string
          voucher_message: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          gifted_by_name?: string | null
          gifted_to_birthday: string
          gifted_to_name: string
          gifted_to_phone?: string | null
          id?: string
          redeemed_at?: string | null
          reminder_sent_at?: string | null
          service_name: string
          shop_id: string
          status?: string
          updated_at?: string
          voucher_message?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          gifted_by_name?: string | null
          gifted_to_birthday?: string
          gifted_to_name?: string
          gifted_to_phone?: string | null
          id?: string
          redeemed_at?: string | null
          reminder_sent_at?: string | null
          service_name?: string
          shop_id?: string
          status?: string
          updated_at?: string
          voucher_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_mark_partner_commissions_paid: {
        Args: { p_actor_user_id: string; p_partner_id: string }
        Returns: {
          payout_id: string
          total_amount: number
          updated_count: number
        }[]
      }
      current_user_role: { Args: never; Returns: string }
      current_user_shop_id: { Args: never; Returns: string }
      generate_shop_slug: { Args: { shop_name: string }; Returns: string }
      get_staff_for_my_shop: {
        Args: never
        Returns: {
          created_at: string
          email: string
          is_active: boolean
          name: string
          nombre: string
          role: string
          shop_id: string
          updated_at: string
          user_id: string
        }[]
      }
      increment_loyalty_cut: {
        Args: {
          p_customer_id: string
          p_required_cuts: number
          p_shop_id: string
        }
        Returns: Json
      }
      initialize_new_shop: {
        Args: { p_nombre: string; p_slug: string }
        Returns: string
      }
      is_active_shop: { Args: { p_shop_id: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      redeem_customer_reward: {
        Args: { p_customer_id: string; p_shop_id: string }
        Returns: Json
      }
      set_staff_role_for_my_shop: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
