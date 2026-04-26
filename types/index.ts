// ─── User ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  phone?: string;
  created_at: string;
}

// ─── Friends ─────────────────────────────────────────────────────────────────
export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  friend?: User;
}

// ─── Groups ──────────────────────────────────────────────────────────────────
export type GroupType = 'home' | 'trip' | 'couple' | 'other';

export interface Group {
  id: string;
  name: string;
  type: GroupType;
  created_by: string;
  created_at: string;
  members?: GroupMember[];
  balance?: number;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  joined_at: string;
  user?: User;
}

// ─── Expenses ────────────────────────────────────────────────────────────────
export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares';
export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'accommodation'
  | 'entertainment'
  | 'utilities'
  | 'shopping'
  | 'health'
  | 'other';

export interface Expense {
  id: string;
  group_id?: string;
  description: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  paid_by: string;
  split_type: SplitType;
  date: string;
  receipt_url?: string;
  created_at: string;
  splits?: ExpenseSplit[];
  payer?: User;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number;
  paid: boolean;
  user?: User;
}

// ─── Settlements ─────────────────────────────────────────────────────────────
export interface Settlement {
  id: string;
  group_id?: string;
  payer_id: string;
  payee_id: string;
  amount: number;
  currency: string;
  note?: string;
  created_at: string;
  payer?: User;
  payee?: User;
}

// ─── Activity ────────────────────────────────────────────────────────────────
export type ActivityType = 'expense_added' | 'expense_edited' | 'expense_deleted' | 'settlement' | 'member_added';

export interface Activity {
  id: string;
  type: ActivityType;
  actor_id: string;
  group_id?: string;
  expense_id?: string;
  settlement_id?: string;
  created_at: string;
  actor?: User;
  expense?: Expense;
  settlement?: Settlement;
}

// ─── Balance ─────────────────────────────────────────────────────────────────
export interface Balance {
  user_id: string;
  user?: User;
  amount: number; // positive = they owe you, negative = you owe them
}
