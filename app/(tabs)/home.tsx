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
    const { data, error } = await supabase
      .from('expense_splits')
      .select('*, expense:expenses(paid_by, amount), user:profiles(id, full_name, avatar_url)')
      .eq('user_id', user.id)
      .eq('paid', false);

    if (!error && data) {
      const balanceMap: Record<string, { amount: number }> = {};
      for (const split of data) {
        const paidBy = split.expense?.paid_by;
        if (!paidBy || paidBy === user.id) continue;
        if (!balanceMap[paidBy]) balanceMap[paidBy] = { amount: 0 };
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

  const net = totalOwed - totalOwe;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBalances(); }} tintColor="#4f46e5" />
        }
      >
        {/* Header */}
        <View className="px-6 pt-4 pb-2">
          <Text className="text-gray-500 text-sm">Welcome back,</Text>
          <Text className="text-gray-900 text-2xl font-bold">{user?.full_name ?? 'User'} 👋</Text>
        </View>

        {/* Net Balance Hero */}
        <View className="mx-6 mt-4 mb-4 bg-indigo-600 rounded-2xl p-6">
          <Text className="text-indigo-200 text-sm font-medium mb-1">NET BALANCE</Text>
          <Text className="text-white text-4xl font-bold">
            {net >= 0 ? '+' : '-'}{formatCurrency(Math.abs(net))}
          </Text>
          <Text className="text-indigo-200 text-sm mt-1">
            {net >= 0 ? 'Overall you are owed' : 'Overall you owe'}
          </Text>
        </View>

        {/* Balance Cards */}
        <View className="flex-row px-6 gap-3 mb-5">
          <View className="flex-1 bg-white rounded-2xl p-4 border border-gray-100">
            <Text className="text-gray-500 text-xs font-semibold mb-1">YOU ARE OWED</Text>
            <Text className="text-green-600 text-xl font-bold">{formatCurrency(totalOwed)}</Text>
          </View>
          <View className="flex-1 bg-white rounded-2xl p-4 border border-gray-100">
            <Text className="text-gray-500 text-xs font-semibold mb-1">YOU OWE</Text>
            <Text className="text-red-500 text-xl font-bold">{formatCurrency(totalOwe)}</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View className="px-6 mb-5">
          <Text className="text-gray-900 font-bold text-lg mb-3">Quick Actions</Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              className="flex-1 bg-indigo-600 rounded-2xl p-4 items-center"
              onPress={() => router.push('/group/new')}
            >
              <Text className="text-2xl mb-1">➕</Text>
              <Text className="text-white text-xs font-semibold">New Group</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-white border border-gray-100 rounded-2xl p-4 items-center"
              onPress={() => router.push('/(tabs)/groups')}
            >
              <Text className="text-2xl mb-1">💸</Text>
              <Text className="text-gray-700 text-xs font-semibold">Add Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-white border border-gray-100 rounded-2xl p-4 items-center"
              onPress={() => router.push('/(tabs)/activity')}
            >
              <Text className="text-2xl mb-1">📊</Text>
              <Text className="text-gray-700 text-xs font-semibold">Activity</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Balances */}
        <View className="px-6 pb-8">
          <Text className="text-gray-900 font-bold text-lg mb-3">Balances</Text>
          {loading ? (
            <ActivityIndicator color="#4f46e5" />
          ) : balances.length === 0 ? (
            <View className="bg-white rounded-2xl p-6 items-center border border-gray-100">
              <Text className="text-4xl mb-2">🎉</Text>
              <Text className="text-gray-900 font-bold">All settled up!</Text>
              <Text className="text-gray-500 text-sm mt-1 text-center">
                No outstanding balances with friends
              </Text>
            </View>
          ) : (
            balances.map((balance) => (
              <View
                key={balance.user_id}
                className="bg-white rounded-xl p-4 mb-2 flex-row justify-between items-center border border-gray-100"
              >
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-indigo-100 items-center justify-center">
                    <Text className="text-indigo-600 font-bold">?</Text>
                  </View>
                  <Text className="text-gray-900 font-medium">Friend</Text>
                </View>
                <Text className={`font-bold text-base ${balance.amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
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
