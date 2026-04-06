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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          event_type: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          event_type: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      asset_improvements: {
        Row: {
          amount: number
          asset_id: string
          created_at: string
          date: string
          fund_id: string | null
          id: string
          name: string
          note: string | null
          user_id: string
        }
        Insert: {
          amount: number
          asset_id: string
          created_at?: string
          date?: string
          fund_id?: string | null
          id?: string
          name: string
          note?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          asset_id?: string
          created_at?: string
          date?: string
          fund_id?: string | null
          id?: string
          name?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_improvements_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_payments: {
        Row: {
          amount: number
          asset_id: string
          created_at: string
          due_date: string
          fund_id: string | null
          id: string
          note: string | null
          paid_date: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          asset_id: string
          created_at?: string
          due_date: string
          fund_id?: string | null
          id?: string
          note?: string | null
          paid_date?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          asset_id?: string
          created_at?: string
          due_date?: string
          fund_id?: string | null
          id?: string
          note?: string | null
          paid_date?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_payments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          created_at: string
          current_value: number
          depreciation_fund_id: string | null
          depreciation_rate: number
          fund_id: string | null
          id: string
          installment_count: number
          monthly_depreciation: number
          name: string
          notes: string | null
          paid_amount: number
          payment_type: string
          purchase_date: string
          status: string
          total_depreciation: number
          updated_at: string
          user_id: string
          value: number
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          current_value?: number
          depreciation_fund_id?: string | null
          depreciation_rate?: number
          fund_id?: string | null
          id?: string
          installment_count?: number
          monthly_depreciation?: number
          name: string
          notes?: string | null
          paid_amount?: number
          payment_type?: string
          purchase_date?: string
          status?: string
          total_depreciation?: number
          updated_at?: string
          user_id: string
          value?: number
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          current_value?: number
          depreciation_fund_id?: string | null
          depreciation_rate?: number
          fund_id?: string | null
          id?: string
          installment_count?: number
          monthly_depreciation?: number
          name?: string
          notes?: string | null
          paid_amount?: number
          payment_type?: string
          purchase_date?: string
          status?: string
          total_depreciation?: number
          updated_at?: string
          user_id?: string
          value?: number
          vendor_id?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          max_users: number
          name: string
          owner_user_id: string
          phone: string | null
          plan: string
          status: string
          subscription_expires_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          max_users?: number
          name?: string
          owner_user_id: string
          phone?: string | null
          plan?: string
          status?: string
          subscription_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          max_users?: number
          name?: string
          owner_user_id?: string
          phone?: string | null
          plan?: string
          status?: string
          subscription_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          company_address: string | null
          company_email: string | null
          company_logo_url: string | null
          company_name: string | null
          company_phone: string | null
          created_at: string
          id: string
          tax_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_address?: string | null
          company_email?: string | null
          company_logo_url?: string | null
          company_name?: string | null
          company_phone?: string | null
          created_at?: string
          id?: string
          tax_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_address?: string | null
          company_email?: string | null
          company_logo_url?: string | null
          company_name?: string | null
          company_phone?: string | null
          created_at?: string
          id?: string
          tax_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          address: string | null
          balance: number
          company: string | null
          created_at: string
          created_by_name: string | null
          custom_type: string | null
          email: string | null
          id: string
          linked_contacts: string[] | null
          name: string
          notes: string | null
          parent_contact_id: string | null
          phone: string | null
          status: string
          total_credit: number
          total_debit: number
          total_transactions: number
          type: Database["public"]["Enums"]["contact_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          balance?: number
          company?: string | null
          created_at?: string
          created_by_name?: string | null
          custom_type?: string | null
          email?: string | null
          id?: string
          linked_contacts?: string[] | null
          name: string
          notes?: string | null
          parent_contact_id?: string | null
          phone?: string | null
          status?: string
          total_credit?: number
          total_debit?: number
          total_transactions?: number
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          balance?: number
          company?: string | null
          created_at?: string
          created_by_name?: string | null
          custom_type?: string | null
          email?: string | null
          id?: string
          linked_contacts?: string[] | null
          name?: string
          notes?: string | null
          parent_contact_id?: string | null
          phone?: string | null
          status?: string
          total_credit?: number
          total_debit?: number
          total_transactions?: number
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_parent_contact_id_fkey"
            columns: ["parent_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      containers: {
        Row: {
          arrival_date: string | null
          attachments: string[] | null
          capacity: number
          clearance_date: string | null
          container_number: string
          container_price: number | null
          cost_per_meter: number | null
          created_at: string
          created_by_name: string | null
          customs_cost: number
          departure_date: string | null
          destination_country: string | null
          glass_fees: number | null
          id: string
          is_manually_closed: boolean
          loading_days: number | null
          notes: string | null
          occupied_area: number | null
          occupied_volume: number | null
          origin_country: string | null
          other_costs: number
          port_cost: number
          profit: number
          rental_date: string | null
          rental_days: number | null
          route: string
          shipping_agent_id: string | null
          shipping_cost: number
          status: Database["public"]["Enums"]["container_status"]
          total_cost: number
          total_revenue: number
          type: string
          updated_at: string
          used_capacity: number
          user_id: string
        }
        Insert: {
          arrival_date?: string | null
          attachments?: string[] | null
          capacity?: number
          clearance_date?: string | null
          container_number: string
          container_price?: number | null
          cost_per_meter?: number | null
          created_at?: string
          created_by_name?: string | null
          customs_cost?: number
          departure_date?: string | null
          destination_country?: string | null
          glass_fees?: number | null
          id?: string
          is_manually_closed?: boolean
          loading_days?: number | null
          notes?: string | null
          occupied_area?: number | null
          occupied_volume?: number | null
          origin_country?: string | null
          other_costs?: number
          port_cost?: number
          profit?: number
          rental_date?: string | null
          rental_days?: number | null
          route: string
          shipping_agent_id?: string | null
          shipping_cost?: number
          status?: Database["public"]["Enums"]["container_status"]
          total_cost?: number
          total_revenue?: number
          type?: string
          updated_at?: string
          used_capacity?: number
          user_id: string
        }
        Update: {
          arrival_date?: string | null
          attachments?: string[] | null
          capacity?: number
          clearance_date?: string | null
          container_number?: string
          container_price?: number | null
          cost_per_meter?: number | null
          created_at?: string
          created_by_name?: string | null
          customs_cost?: number
          departure_date?: string | null
          destination_country?: string | null
          glass_fees?: number | null
          id?: string
          is_manually_closed?: boolean
          loading_days?: number | null
          notes?: string | null
          occupied_area?: number | null
          occupied_volume?: number | null
          origin_country?: string | null
          other_costs?: number
          port_cost?: number
          profit?: number
          rental_date?: string | null
          rental_days?: number | null
          route?: string
          shipping_agent_id?: string | null
          shipping_cost?: number
          status?: Database["public"]["Enums"]["container_status"]
          total_cost?: number
          total_revenue?: number
          type?: string
          updated_at?: string
          used_capacity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "containers_shipping_agent_id_fkey"
            columns: ["shipping_agent_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          exchange_rate: number | null
          id: string
          is_default: boolean | null
          name: string
          symbol: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          exchange_rate?: number | null
          id?: string
          is_default?: boolean | null
          name: string
          symbol: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          exchange_rate?: number | null
          id?: string
          is_default?: boolean | null
          name?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      debt_payments: {
        Row: {
          amount: number
          created_at: string
          date: string
          debt_id: string
          fund_id: string | null
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          date?: string
          debt_id: string
          fund_id?: string | null
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          debt_id?: string
          fund_id?: string | null
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          account_id: string | null
          contact_id: string | null
          created_at: string
          created_by_name: string | null
          description: string | null
          due_date: string | null
          id: string
          original_amount: number
          project_id: string | null
          remaining_amount: number
          status: Database["public"]["Enums"]["debt_status"]
          type: Database["public"]["Enums"]["debt_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by_name?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          original_amount: number
          project_id?: string | null
          remaining_amount: number
          status?: Database["public"]["Enums"]["debt_status"]
          type: Database["public"]["Enums"]["debt_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by_name?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          original_amount?: number
          project_id?: string | null
          remaining_amount?: number
          status?: Database["public"]["Enums"]["debt_status"]
          type?: Database["public"]["Enums"]["debt_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          balance: number
          created_at: string
          currency_code: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          type: Database["public"]["Enums"]["fund_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency_code?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          type?: Database["public"]["Enums"]["fund_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency_code?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["fund_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ledger_accounts: {
        Row: {
          address: string | null
          balance: number
          created_at: string
          custom_type: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          balance?: number
          created_at?: string
          custom_type?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          balance?: number
          created_at?: string
          custom_type?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          attachments: string[] | null
          client_id: string | null
          commission: number | null
          completion_date: string | null
          contract_value: number
          created_at: string
          created_by_name: string | null
          currency_difference: number | null
          end_date: string | null
          expenses: number
          id: string
          name: string
          notes: string | null
          profit: number
          received_amount: number
          start_date: string | null
          status: string
          updated_at: string
          user_id: string
          vendor_id: string | null
        }
        Insert: {
          attachments?: string[] | null
          client_id?: string | null
          commission?: number | null
          completion_date?: string | null
          contract_value?: number
          created_at?: string
          created_by_name?: string | null
          currency_difference?: number | null
          end_date?: string | null
          expenses?: number
          id?: string
          name: string
          notes?: string | null
          profit?: number
          received_amount?: number
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
          vendor_id?: string | null
        }
        Update: {
          attachments?: string[] | null
          client_id?: string | null
          commission?: number | null
          completion_date?: string | null
          contract_value?: number
          created_at?: string
          created_by_name?: string | null
          currency_difference?: number | null
          end_date?: string | null
          expenses?: number
          id?: string
          name?: string
          notes?: string | null
          profit?: number
          received_amount?: number
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_payments: {
        Row: {
          amount: number
          created_at: string
          date: string
          fund_id: string | null
          id: string
          note: string | null
          shipment_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          date?: string
          fund_id?: string | null
          id?: string
          note?: string | null
          shipment_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          fund_id?: string | null
          id?: string
          note?: string | null
          shipment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_payments_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_payments_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_payments_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_balance"
            referencedColumns: ["shipment_id"]
          },
        ]
      }
      shipments: {
        Row: {
          amount_paid: number
          attachments: string[] | null
          cbm: number
          china_expenses: number | null
          client_code: string | null
          client_id: string | null
          client_name: string
          container_id: string
          contract_price: number
          created_at: string
          created_by_name: string | null
          customs_fees: number | null
          domestic_shipping_cost: number | null
          goods_type: string
          height: number
          id: string
          internal_transport_fees: number | null
          length: number
          manual_cargo_code: string
          notes: string | null
          package_number: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          port_delivery_fees: number | null
          price_per_meter: number
          quantity: number
          recipient_name: string | null
          remaining_amount: number
          sea_freight: number | null
          tracking_number: string | null
          transit_cost: number | null
          updated_at: string
          user_id: string
          weight: number | null
          width: number
        }
        Insert: {
          amount_paid?: number
          attachments?: string[] | null
          cbm?: number
          china_expenses?: number | null
          client_code?: string | null
          client_id?: string | null
          client_name: string
          container_id: string
          contract_price?: number
          created_at?: string
          created_by_name?: string | null
          customs_fees?: number | null
          domestic_shipping_cost?: number | null
          goods_type: string
          height?: number
          id?: string
          internal_transport_fees?: number | null
          length?: number
          manual_cargo_code: string
          notes?: string | null
          package_number?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          port_delivery_fees?: number | null
          price_per_meter?: number
          quantity?: number
          recipient_name?: string | null
          remaining_amount?: number
          sea_freight?: number | null
          tracking_number?: string | null
          transit_cost?: number | null
          updated_at?: string
          user_id: string
          weight?: number | null
          width?: number
        }
        Update: {
          amount_paid?: number
          attachments?: string[] | null
          cbm?: number
          china_expenses?: number | null
          client_code?: string | null
          client_id?: string | null
          client_name?: string
          container_id?: string
          contract_price?: number
          created_at?: string
          created_by_name?: string | null
          customs_fees?: number | null
          domestic_shipping_cost?: number | null
          goods_type?: string
          height?: number
          id?: string
          internal_transport_fees?: number | null
          length?: number
          manual_cargo_code?: string
          notes?: string | null
          package_number?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          port_delivery_fees?: number | null
          price_per_meter?: number
          quantity?: number
          recipient_name?: string | null
          remaining_amount?: number
          sea_freight?: number | null
          tracking_number?: string | null
          transit_cost?: number | null
          updated_at?: string
          user_id?: string
          weight?: number | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "shipments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          attachments: string[] | null
          category: string
          contact_id: string | null
          created_at: string
          created_by_name: string | null
          currency_code: string | null
          date: string
          description: string | null
          exchange_rate: number | null
          fund_id: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          posting_batch_id: string | null
          project_id: string | null
          reference_id: string | null
          shipment_id: string | null
          source_type: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          attachments?: string[] | null
          category: string
          contact_id?: string | null
          created_at?: string
          created_by_name?: string | null
          currency_code?: string | null
          date?: string
          description?: string | null
          exchange_rate?: number | null
          fund_id?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          posting_batch_id?: string | null
          project_id?: string | null
          reference_id?: string | null
          shipment_id?: string | null
          source_type?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          attachments?: string[] | null
          category?: string
          contact_id?: string | null
          created_at?: string
          created_by_name?: string | null
          currency_code?: string | null
          date?: string
          description?: string | null
          exchange_rate?: number | null
          fund_id?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          posting_batch_id?: string | null
          project_id?: string | null
          reference_id?: string | null
          shipment_id?: string | null
          source_type?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_balance"
            referencedColumns: ["shipment_id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          company_id: string | null
          created_at: string
          id: string
          module: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          module: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          module?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_account_ledger: {
        Row: {
          amount: number | null
          category: string | null
          contact_id: string | null
          created_at: string | null
          date: string | null
          description: string | null
          fund_id: string | null
          id: string | null
          notes: string | null
          posting_batch_id: string | null
          project_id: string | null
          reference_id: string | null
          shipment_id: string | null
          signed_amount: number | null
          source_type: string | null
          type: Database["public"]["Enums"]["transaction_type"] | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          contact_id?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          fund_id?: string | null
          id?: string | null
          notes?: string | null
          posting_batch_id?: string | null
          project_id?: string | null
          reference_id?: string | null
          shipment_id?: string | null
          signed_amount?: never
          source_type?: string | null
          type?: Database["public"]["Enums"]["transaction_type"] | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          contact_id?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          fund_id?: string | null
          id?: string | null
          notes?: string | null
          posting_batch_id?: string | null
          project_id?: string | null
          reference_id?: string | null
          shipment_id?: string | null
          signed_amount?: never
          source_type?: string | null
          type?: Database["public"]["Enums"]["transaction_type"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_balance"
            referencedColumns: ["shipment_id"]
          },
        ]
      }
      v_contact_balance: {
        Row: {
          balance: number | null
          contact_id: string | null
          total_credit: number | null
          total_debit: number | null
          total_transactions: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      v_invoice_balance: {
        Row: {
          calc_status: string | null
          cbm: number | null
          client_id: string | null
          client_name: string | null
          container_id: string | null
          contract_price: number | null
          goods_type: string | null
          invoice_amount: number | null
          remaining: number | null
          shipment_id: string | null
          total_paid: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      company_user_ids: { Args: never; Returns: string[] }
      create_container_with_accounting: {
        Args: {
          p_arrival_date?: string
          p_capacity?: number
          p_container_number: string
          p_container_price?: number
          p_cost_per_meter?: number
          p_customs_cost?: number
          p_departure_date?: string
          p_destination_country?: string
          p_glass_fees?: number
          p_loading_days?: number
          p_notes?: string
          p_origin_country?: string
          p_other_costs?: number
          p_port_cost?: number
          p_rental_date?: string
          p_rental_days?: number
          p_route?: string
          p_shipping_agent_id?: string
          p_shipping_cost?: number
          p_status?: string
          p_type?: string
        }
        Returns: string
      }
      create_project_with_accounting: {
        Args: {
          p_client_id?: string
          p_commission?: number
          p_contract_value?: number
          p_currency_difference?: number
          p_end_date?: string
          p_expenses?: number
          p_name: string
          p_notes?: string
          p_start_date?: string
          p_status?: string
          p_vendor_id?: string
        }
        Returns: string
      }
      create_shipment_with_accounting:
        | {
            Args: {
              p_amount_paid?: number
              p_cbm?: number
              p_china_expenses?: number
              p_client_code?: string
              p_client_id?: string
              p_client_name?: string
              p_container_id: string
              p_customs_fees?: number
              p_domestic_shipping_cost?: number
              p_fund_id?: string
              p_goods_type?: string
              p_height?: number
              p_internal_transport_fees?: number
              p_length?: number
              p_manual_cargo_code?: string
              p_notes?: string
              p_package_number?: string
              p_port_delivery_fees?: number
              p_price_per_meter?: number
              p_quantity?: number
              p_recipient_name?: string
              p_sea_freight?: number
              p_tracking_number?: string
              p_transit_cost?: number
              p_weight?: number
              p_width?: number
            }
            Returns: string
          }
        | {
            Args: {
              p_amount_paid?: number
              p_cbm?: number
              p_china_expenses?: number
              p_client_code?: string
              p_client_id?: string
              p_client_name?: string
              p_container_id: string
              p_customs_fees?: number
              p_fund_id?: string
              p_goods_type?: string
              p_height?: number
              p_internal_transport_fees?: number
              p_length?: number
              p_manual_cargo_code?: string
              p_notes?: string
              p_port_delivery_fees?: number
              p_price_per_meter?: number
              p_quantity?: number
              p_recipient_name?: string
              p_sea_freight?: number
              p_tracking_number?: string
              p_weight?: number
              p_width?: number
            }
            Returns: string
          }
      delete_container_with_shipments: {
        Args: { p_container_id: string }
        Returns: undefined
      }
      delete_project_with_accounting: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      delete_shipment_with_accounting: {
        Args: { p_shipment_id: string }
        Returns: undefined
      }
      get_company_status: { Args: never; Returns: string }
      get_current_user_name: { Args: never; Returns: string }
      get_financial_summary: { Args: never; Returns: Json }
      get_user_company_id: { Args: never; Returns: string }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      process_shipment_payment: {
        Args: {
          p_amount: number
          p_fund_id?: string
          p_note?: string
          p_shipment_id: string
        }
        Returns: undefined
      }
      process_transaction: {
        Args: {
          p_amount: number
          p_category: string
          p_contact_id?: string
          p_currency_code?: string
          p_date: string
          p_description: string
          p_exchange_rate?: number
          p_fund_id?: string
          p_notes?: string
          p_original_amount?: number
          p_project_id?: string
          p_to_fund_id?: string
          p_type: string
        }
        Returns: string
      }
      reverse_transaction: {
        Args: { p_transaction_id: string }
        Returns: undefined
      }
      sync_contact_balances: { Args: never; Returns: undefined }
      sync_contact_balances_admin: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      track_shipment_public: {
        Args: { p_client_code: string; p_package_number: string }
        Returns: Json
      }
      update_project_with_accounting: {
        Args: {
          p_client_id?: string
          p_commission?: number
          p_contract_value?: number
          p_currency_difference?: number
          p_end_date?: string
          p_expenses?: number
          p_name?: string
          p_notes?: string
          p_project_id: string
          p_received_amount?: number
          p_start_date?: string
          p_status?: string
          p_vendor_id?: string
        }
        Returns: undefined
      }
      update_shipment_with_accounting: {
        Args: {
          p_amount_paid?: number
          p_client_name?: string
          p_goods_type?: string
          p_height?: number
          p_length?: number
          p_notes?: string
          p_price_per_meter?: number
          p_quantity?: number
          p_shipment_id: string
          p_tracking_number?: string
          p_width?: number
        }
        Returns: undefined
      }
      update_transaction: {
        Args: {
          p_amount?: number
          p_category?: string
          p_contact_id?: string
          p_currency_code?: string
          p_date?: string
          p_description?: string
          p_exchange_rate?: number
          p_fund_id?: string
          p_notes?: string
          p_transaction_id: string
          p_type?: string
        }
        Returns: undefined
      }
      verify_company_access: {
        Args: { _target_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      account_type:
        | "client"
        | "vendor"
        | "partner"
        | "investor"
        | "employee"
        | "custom"
      app_role: "admin" | "accountant" | "shipping_staff" | "viewer" | "owner"
      contact_type:
        | "client"
        | "vendor"
        | "shipping_agent"
        | "employee"
        | "partner"
        | "other"
      container_status:
        | "loading"
        | "shipped"
        | "arrived"
        | "cleared"
        | "delivered"
      debt_status: "pending" | "partial" | "paid" | "overdue"
      debt_type: "receivable" | "payable"
      fund_type: "cash" | "bank" | "wallet" | "safe" | "other"
      payment_status: "unpaid" | "partial" | "paid"
      posting_source:
        | "manual"
        | "shipment_invoice"
        | "shipment_payment"
        | "project_client"
        | "project_vendor"
        | "debt_payment"
        | "fund_transfer"
      transaction_type: "in" | "out"
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
      account_type: [
        "client",
        "vendor",
        "partner",
        "investor",
        "employee",
        "custom",
      ],
      app_role: ["admin", "accountant", "shipping_staff", "viewer", "owner"],
      contact_type: [
        "client",
        "vendor",
        "shipping_agent",
        "employee",
        "partner",
        "other",
      ],
      container_status: [
        "loading",
        "shipped",
        "arrived",
        "cleared",
        "delivered",
      ],
      debt_status: ["pending", "partial", "paid", "overdue"],
      debt_type: ["receivable", "payable"],
      fund_type: ["cash", "bank", "wallet", "safe", "other"],
      payment_status: ["unpaid", "partial", "paid"],
      posting_source: [
        "manual",
        "shipment_invoice",
        "shipment_payment",
        "project_client",
        "project_vendor",
        "debt_payment",
        "fund_transfer",
      ],
      transaction_type: ["in", "out"],
    },
  },
} as const
