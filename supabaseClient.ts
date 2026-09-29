import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// orders 테이블 행 타입
export interface OrderRow {
  id?: string;
  name: string;
  phone: string;
  beverage_name: string;
  size: 'S' | 'M' | 'L';
  selected_options: string[];
  quantity: number;
  requests: string;
  total_price: number;
  order_time: string;
  created_at?: string;
}