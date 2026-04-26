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
    const { data, error } = await supabase
      .from('group_members')
      .select('group:groups(*)')
      .eq('user_id', userId);

    if (!error && data) {
      const groups = data.map((d: any) => d.group) as Group[];
      set({ groups });
    }
    set({ loading: false });
  },

  addGroup: (group) => set((state) => ({ groups: [group, ...state.groups] })),

  updateGroup: (group) =>
    set((state) => ({
      groups: state.groups.map((g) => (g.id === group.id ? group : g)),
    })),

  removeGroup: (groupId) =>
    set((state) => ({ groups: state.groups.filter((g) => g.id !== groupId) })),
}));
