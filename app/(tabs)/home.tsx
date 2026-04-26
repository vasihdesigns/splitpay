import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@/lib/utils';
import { Balance } from '@/types';

export default function HomeScreen() {
  const { user } = useAuthStore();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [totalOwed, setTotalOwed] = useState(0);
  const [totalOwe, setTotalOwe] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  async function fetchBalances() {
    if (!user) return;
    // Fetch all expense splits involving the current user
    const { data, error } = await supabase
      .from('expense_splits')
      .select('*, expense:expenses(paid_by, amount), user:profiles(id, full_name, avatar_url)')
      .eq('user_id', user.id)
      .eq('paid', false);

    if (!error && data) {
      // Simplified balance computation
      const balanceMap: Record<string, { amount: number; user: any }> = {};
      for (const split of data) {
        const paidBy = split.expense?.paid_by;
        if (!paidBy || paidBy === user.id) continue;
        if (!balanceMap[paidBy]) balanceMap[paidBy] = { amount: 0, user: null };
        balanceMap[paidBy].amount -= split.amount;
      }
      const result = Object.entries(balanceMap).map(([uid, val]) => ({
        user_id: uid,
        amount: val.amount,
      }));
      setBalances(result);
      setTotalOwed(result.filter((b) => b.amount > 0).reduce((s, b) => s + b.amount, 0));
      setTotalOwe(result.filter((b) => b.amount < 0).reduce((s, b) => s + Math.abs(b.amount), 0));
    }
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { fetchBalances(); }, [user]);

  return (
    <SafeAreaView className="flex-1 bg-primary-950">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBalances(); }} tintColor="#6366f1" />
        }
      >
        {/* Header */}
        <View className="px-6 pt-4 pb-6">
          <Text className="text-primary-300 text-base">Welcome back,</Text>
          <Text className="text-white text-2xl font-bold">{user?.full_name ?? 'User'} 👋</Text>
        </View>

        {/* Balance Cards */}
        <View className="flex-row px-6 gap-4 mb-6">
          <View className="flex-1 bg-primary-900 rounded-2xl p-4">
            <Text className="text-primary-300 text-xs font-medium mb-1">YOU ARE OWED</Text>
            <Text className="text-success text-xl font-bold">{formatCurrency(totalOwed)}</Text>
          </View>
          <View className="flex-1 bg-primary-900 rounded-2xl p-4">
            <Text className="text-primary-300 text-xs font-medium mb-1">YOU OWE</Text>
            <Text className="text-danger text-xl font-bold">{formatCurrency(totalOwe)}</Text>
          </View>
        </View>

        {/* Net Balance */}
        <View className="mx-6 mb-6 bg-primary-800 rounded-2xl p-5">
          <Text className="text-primary-300 text-sm font-medium mb-1">NET BALANCE</Text>
          <Text
            className={`text-3xl font-bold ${
              totalOwed - totalOwe >= 0 ? 'text-success' : 'text-danger'
            }`}
          >
            {totalOwed - totalOwe >= 0 ? '+' : '-'}
            {formatCurrency(Math.abs(totalOwed - totalOwe))}
          </Text>
        </View>

        {/* Quick Actions */}
        <View className="px-6 mb-6">
          <Text className="text-white font-bold text-lg mb-3">Quick Actions</Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              className="flex-1 bg-primary-600 rounded-2xl p-4 items-center"
              onPress={() => router.push('/group/new')}
            >
              <Text className="text-2xl mb-1">➕</Text>
              <Text className="text-white text-sm font-medium">New Group</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-primary-700 rounded-2xl p-4 items-center"
              onPress={() => router.push('/(tabs)/groups')}
            >
              <Text className="text-2xl mb-1">💸</Text>
              <Text className="text-white text-sm font-medium">Add Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-primary-700 rounded-2xl p-4 items-center"
              onPress={() => router.push('/(tabs)/activity')}
            >
              <Text className="text-2xl mb-1">📊</Text>
              <Text className="text-white text-sm font-medium">Activity</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Balances List */}
        <View className="px-6 pb-8">
          <Text className="text-white font-bold text-lg mb-3">Balances</Text>
          {loading ? (
            <ActivityIndicator color="#6366f1" />
          ) : balances.length === 0 ? (
            <View className="bg-primary-900 rounded-2xl p-6 items-center">
              <Text className="text-4xl mb-2">🎉</Text>
              <Text className="text-white font-bold">All settled up!</Text>
              <Text className="text-primary-400 text-sm mt-1 text-center">
                No outstanding balances with friends
              </Text>
            </View>
          ) : (
            balances.map((balance) => (
              <View
                key={balance.user_id}
                className="bg-primary-900 rounded-xl p-4 mb-2 flex-row justify-between items-center"
              >
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-primary-700 items-center justify-center">
                    <Text className="text-white font-bold">?</Text>
                  </View>
                  <Text className="text-white font-medium">Friend</Text>
                </View>
                <Text
                  className={`font-bold text-base ${
                    balance.amount >= 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {balance.amount >= 0 ? 'owes you ' : 'you owe '}
                  {formatCurrency(Math.abs(balance.amount))}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
