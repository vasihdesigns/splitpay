import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Expense, Group } from '@/types';

const CATEGORY_ICONS: Record<string, string> = {
  food: '🍔',
  transport: '🚗',
  accommodation: '🏨',
  entertainment: '🎬',
  utilities: '💡',
  shopping: '🛍️',
  health: '💊',
  other: '📦',
};

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const router = useRouter();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchGroup() {
    if (!id || id === 'new') return;
    const [groupRes, expenseRes] = await Promise.all([
      supabase.from('groups').select('*, members:group_members(*, user:profiles(*))').eq('id', id).single(),
      supabase.from('expenses').select('*, payer:profiles(*), splits:expense_splits(*)').eq('group_id', id).order('date', { ascending: false }),
    ]);
    if (!groupRes.error) setGroup(groupRes.data as Group);
    if (!expenseRes.error) setExpenses(expenseRes.data as Expense[]);
    setLoading(false);
  }

  useEffect(() => { fetchGroup(); }, [id]);

  if (id === 'new') {
    return <CreateGroupScreen />;
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-primary-950 items-center justify-center">
        <ActivityIndicator color="#6366f1" size="large" />
      </SafeAreaView>
    );
  }

  const myExpenses = expenses.reduce((total, expense) => {
    if (expense.paid_by === user?.id) return total + expense.amount;
    return total;
  }, 0);

  return (
    <SafeAreaView className="flex-1 bg-primary-950">
      {/* Header */}
      <View className="flex-row items-center px-4 pt-2 pb-4 gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-2">
          <Text className="text-primary-300 text-lg">‹ Back</Text>
        </TouchableOpacity>
        <Text className="text-white text-xl font-bold flex-1">{group?.name}</Text>
        <TouchableOpacity className="bg-primary-500 rounded-xl px-3 py-2">
          <Text className="text-white font-bold text-sm">+ Expense</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4">
        {/* Stats */}
        <View className="flex-row gap-3 mb-5">
          <View className="flex-1 bg-primary-900 rounded-xl p-3">
            <Text className="text-primary-400 text-xs">Total Spent</Text>
            <Text className="text-white font-bold text-lg">
              {formatCurrency(expenses.reduce((s, e) => s + e.amount, 0))}
            </Text>
          </View>
          <View className="flex-1 bg-primary-900 rounded-xl p-3">
            <Text className="text-primary-400 text-xs">You Paid</Text>
            <Text className="text-white font-bold text-lg">{formatCurrency(myExpenses)}</Text>
          </View>
          <View className="flex-1 bg-primary-900 rounded-xl p-3">
            <Text className="text-primary-400 text-xs">Members</Text>
            <Text className="text-white font-bold text-lg">{group?.members?.length ?? 0}</Text>
          </View>
        </View>

        {/* Expenses */}
        <Text className="text-white font-bold text-lg mb-3">Expenses</Text>
        {expenses.length === 0 ? (
          <View className="bg-primary-900 rounded-2xl p-8 items-center">
            <Text className="text-4xl mb-2">💸</Text>
            <Text className="text-white font-bold">No expenses yet</Text>
            <Text className="text-primary-400 text-sm mt-1 text-center">
              Add your first expense to start tracking
            </Text>
          </View>
        ) : (
          expenses.map((expense) => (
            <View key={expense.id} className="bg-primary-900 rounded-xl p-4 mb-2">
              <View className="flex-row justify-between items-start">
                <View className="flex-row items-center gap-3 flex-1">
                  <View className="w-10 h-10 rounded-xl bg-primary-700 items-center justify-center">
                    <Text>{CATEGORY_ICONS[expense.category] ?? '📦'}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-medium">{expense.description}</Text>
                    <Text className="text-primary-400 text-xs mt-0.5">
                      {expense.payer?.full_name ?? 'Unknown'} · {formatDate(expense.date)}
                    </Text>
                  </View>
                </View>
                <Text className="text-white font-bold text-base">
                  {formatCurrency(expense.amount)}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Inline Create Group Screen ───────────────────────────────────────────────
import { TextInput } from 'react-native';

function CreateGroupScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState<'home' | 'trip' | 'couple' | 'other'>('other');
  const [loading, setLoading] = useState(false);

  const types = [
    { key: 'home', label: 'Home', icon: '🏠' },
    { key: 'trip', label: 'Trip', icon: '✈️' },
    { key: 'couple', label: 'Couple', icon: '💑' },
    { key: 'other', label: 'Other', icon: '👥' },
  ] as const;

  async function handleCreate() {
    if (!name.trim()) { Alert.alert('Error', 'Please enter a group name'); return; }
    if (!user) return;
    setLoading(true);

    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name: name.trim(), type, created_by: user.id })
      .select()
      .single();

    if (error) { Alert.alert('Error', error.message); setLoading(false); return; }

    await supabase.from('group_members').insert({ group_id: group.id, user_id: user.id });

    setLoading(false);
    router.replace(`/group/${group.id}`);
  }

  return (
    <SafeAreaView className="flex-1 bg-primary-950">
      <View className="flex-row items-center px-4 pt-2 pb-4 gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-2">
          <Text className="text-primary-300 text-lg">‹ Back</Text>
        </TouchableOpacity>
        <Text className="text-white text-xl font-bold">Create Group</Text>
      </View>

      <View className="px-6 gap-5">
        <View>
          <Text className="text-primary-300 text-sm font-medium mb-2">Group Name</Text>
          <TextInput
            className="bg-primary-900 text-white rounded-xl px-4 py-3 text-base"
            placeholder="e.g. Barcelona Trip"
            placeholderTextColor="#6366f1"
            value={name}
            onChangeText={setName}
          />
        </View>

        <View>
          <Text className="text-primary-300 text-sm font-medium mb-2">Group Type</Text>
          <View className="flex-row gap-3">
            {types.map((t) => (
              <TouchableOpacity
                key={t.key}
                className={`flex-1 rounded-xl p-3 items-center ${
                  type === t.key ? 'bg-primary-500' : 'bg-primary-900'
                }`}
                onPress={() => setType(t.key)}
              >
                <Text className="text-xl mb-1">{t.icon}</Text>
                <Text className="text-white text-xs font-medium">{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          className="bg-primary-500 rounded-xl py-4 items-center mt-2"
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-base">Create Group</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
