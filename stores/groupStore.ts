import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Group } from '@/types';

interface GroupState {
  groups: Group[];
  loading: boolean;
  fetchGroups: (userId: string) => Promise<void>;
  addGroup: (group: Group) => void;
  updateGroup: (group: Group) => void;
  removeGroup: (groupId: string) => void;
}

export const useGroupStore = create<GroupState>((set) => ({
  groups: [],
  loading: false,

  fetchGroups: async (userId: string) => {
    set({ loading: true });
    try {
      // 1. Get group IDs for this user
      const { data: memberships, error: mErr } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId);

      if (mErr || !memberships?.length) {
        set({ groups: [], loading: false });
        return;
      }

      const groupIds = memberships.map((m: any) => m.group_id);

      // 2. Fetch group info
      const { data: groupData, error: gErr } = await supabase
        .from('groups')
        .select('id, name, type, created_by, created_at')
        .in('id', groupIds);

      if (gErr || !groupData) {
        set({ loading: false });
        return;
      }

      // 3. Fetch all expenses in these groups with splits + currency
      const { data: expenses } = await supabase
        .from('expenses')
        .select('id, group_id, paid_by, currency, splits:expense_splits(user_id, amount, paid)')
        .in('group_id', groupIds);

      // 4. Compute balance + dominant currency per group
      const balanceMap:  Record<string, number> = {};
      const currencyCount: Record<string, Record<string, number>> = {};

      for (const expense of (expenses ?? []) as any[]) {
        // Track currency frequency per group
        const cur = expense.currency ?? 'USD';
        if (!currencyCount[expense.group_id]) currencyCount[expense.group_id] = {};
        currencyCount[expense.group_id][cur] = (currencyCount[expense.group_id][cur] ?? 0) + 1;

        for (const split of (expense.splits ?? []) as any[]) {
          if (split.paid) continue;
          if (expense.paid_by === userId && split.user_id !== userId) {
            balanceMap[expense.group_id] = (balanceMap[expense.group_id] ?? 0) + split.amount;
          } else if (expense.paid_by !== userId && split.user_id === userId) {
            balanceMap[expense.group_id] = (balanceMap[expense.group_id] ?? 0) - split.amount;
          }
        }
      }

      // Pick dominant currency per group
      const currencyMap: Record<string, string> = {};
      for (const [gid, counts] of Object.entries(currencyCount)) {
        currencyMap[gid] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';
      }

      // 5. Attach computed balance + currency to each group
      const groups: Group[] = groupData.map((g: any) => ({
        ...g,
        balance:  balanceMap[g.id]  ?? 0,
        currency: currencyMap[g.id] ?? 'USD',
      }));

      set({ groups });
    } finally {
      set({ loading: false });
    }
  },

  addGroup:    (group) => set((state) => ({ groups: [group, ...state.groups] })),
  updateGroup: (group) => set((state) => ({ groups: state.groups.map((g) => g.id === group.id ? group : g) })),
  removeGroup: (groupId) => set((state) => ({ groups: state.groups.filter((g) => g.id !== groupId) })),
}));
