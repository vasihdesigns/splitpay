import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatDate, formatCurrency } from '@/lib/utils';

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  amount?: number;
  actor_name: string;
  created_at: string;
}

const ACTIVITY_ICONS: Record<string, string> = {
  expense_added: '💸', expense_edited: '✏️', expense_deleted: '🗑️',
  settlement: '✅', member_added: '👋',
};

export default function ActivityScreen() {
  const { user } = useAuthStore();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchActivity() {
    if (!user) return;
    const { data, error } = await supabase
      .from('activities')
      .select('*, actor:profiles(full_name), expense:expenses(description, amount)')
      .or(`actor_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setActivities(data.map((a: any) => ({
        id: a.id,
        type: a.type,
        description: a.expense?.description ?? 'Activity',
        amount: a.expense?.amount,
        actor_name: a.actor?.full_name ?? 'Someone',
        created_at: a.created_at,
      })));
    }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { fetchActivity(); }, [user]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="px-6 pt-4 pb-4">
        <Text className="text-gray-900 text-2xl font-bold">Activity</Text>
      </View>

      <ScrollView
        className="flex-1 px-6"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchActivity(); }} tintColor="#4f46e5" />
        }
      >
        {loading ? (
          <ActivityIndicator color="#4f46e5" className="mt-10" />
        ) : activities.length === 0 ? (
          <View className="items-center mt-20">
            <Text className="text-5xl mb-4">🔔</Text>
            <Text className="text-gray-900 font-bold text-lg">No activity yet</Text>
            <Text className="text-gray-500 text-sm mt-2 text-center">
              Expense activity with friends will appear here
            </Text>
          </View>
        ) : (
          activities.map((item) => (
            <View key={item.id} className="bg-white rounded-xl p-4 mb-2 flex-row items-center gap-3 border border-gray-100">
              <View className="w-10 h-10 rounded-full bg-indigo-50 items-center justify-center">
                <Text>{ACTIVITY_ICONS[item.type] ?? '📌'}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-gray-900 font-medium">
                  {item.actor_name}{' '}
                  <Text className="text-gray-500 font-normal">
                    {item.type === 'expense_added' ? 'added' : item.type.replace('_', ' ')}
                  </Text>{' '}
                  {item.description}
                </Text>
                {item.amount !== undefined && (
                  <Text className="text-gray-500 text-sm">{formatCurrency(item.amount)}</Text>
                )}
                <Text className="text-gray-400 text-xs mt-0.5">{formatDate(item.created_at)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
