export type UserRole = 'admin' | 'editor' | 'premium' | 'reader';
export type SubStatus = 'active' | 'expired' | 'cancelled' | 'none';
export type SubPlan = 'free' | 'monthly' | 'annual';

export interface Subscription {
  status: SubStatus;
  plan: SubPlan;
  started_at?: string | null;
  expires_at: string | null;
  payment_ref?: string | null;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  password_hash: string;
  mobile: string | null;
  role: UserRole;
  auth_methods: ('email' | 'google')[];
  subscription: Subscription;
  created_at: string;
  updated_at?: string;
}

// Lean payload stored in JWT (no sensitive fields)
export interface SessionUser {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  plan: SubPlan;
  sub_status: SubStatus;
}
