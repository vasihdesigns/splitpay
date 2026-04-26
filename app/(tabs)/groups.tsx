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
import { useAuthStore } from '@/stores/authStore';
import { useGroupStore } from '@/stores/groupStore';
import { Group } from '@/types';

const GROUP_ICONS: Record<string, string> = {
  home: '🏠',
  trip: '✈️',
  couple: '💑',
  other: '👥',
};

function GroupCard({ group, onPress }: { group: Group; onPress: () => void }) {
  const balance = group.balance ?? 0;
  return (
    <TouchableOpacity
      className="bg-primary-900 rounded-2xl p-4 mb-3 flex-row items-center justify-between"
      onPress={onPress}
    >
      <View className="flex-row items-center gap-3">
        <View className="w-12 h-12 rounded-xl bg-primary-700 items-center justify-center">
          <Text className="text-2xl">{GROUP_ICONS[group.type] ?? '👥'}</Text>
        </View>
        <View>
          <Text className="text-white font-bold text-base">{group.name}</Text>
          <Text className="text-primary-400 text-xs mt-0.5">
            {group.type.charAt(0).toUpperCase() + group.type.slice(1)}
          </Text>
        </View>
      </View>
      <View className="items-end">
        {balance === 0 ? (
          <Text className="text-primary-400 text-sm">Settled</Text>
        ) : (
          <>
            <Text className="text-primary-400 text-xs">
              {balance > 0 ? 'you are owed' : 'you owe'}
            </Text>
            <Text
              className={`font-bold text-base ${balance > 0 ? 'text-success' : 'text-danger'}`}
            >
              ${Math.abs(balance).toFixed(2)}
            </Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function GroupsScreen() {
  const { user } = useAuthStore();
  const { groups, loading, fetchGroups } = useGroupStore();
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (user) fetchGroups(user.id);
  }, [user]);

  async function handleRefresh() {
    setRefreshing(true);
    if (user) await fetchGroups(user.id);
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-primary-950">
      {/* Header */}
      <View className="flex-row justify-between items-center px-6 pt-4 pb-4">
        <Text className="text-white text-2xl font-bold">Groups</Text>
        <TouchableOpacity
          className="bg-primary-500 rounded-xl px-4 py-2"
          onPress={() => router.push('/group/new')}
        >
          <Text className="text-white font-bold">+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1 px-6"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6366f1" />
        }
      >
        {loading ? (
          <ActivityIndicator color="#6366f1" className="mt-10" />
        ) : groups.length === 0 ? (
          <View className="items-center mt-20">
            <Text className="text-5xl mb-4">👥</Text>
            <Text className="text-white font-bold text-lg">No groups yet</Text>
            <Text className="text-primary-400 text-sm mt-2 text-center">
              Create a group to start splitting expenses with friends
            </Text>
            <TouchableOpacity
              className="mt-6 bg-primary-500 rounded-xl px-6 py-3"
              onPress={() => router.push('/group/new')}
            >
              <Text className="text-white font-bold">Create First Group</Text>
            </TouchableOpacity>
          </View>
        ) : (
          groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              onPress={() => router.push(`/group/${group.id}`)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
