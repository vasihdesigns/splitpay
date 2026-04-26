import { View, Text, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { getInitials } from '@/lib/utils';

export default function AccountScreen() {
  const { user, signOut } = useAuthStore();

  function confirmSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }

  const settings = [
    { label: 'Edit Profile', icon: '✏️', onPress: () => {} },
    { label: 'Notifications', icon: '🔔', onPress: () => {} },
    { label: 'Currency', icon: '💱', onPress: () => {} },
    { label: 'Privacy Policy', icon: '🔒', onPress: () => {} },
    { label: 'Terms of Service', icon: '📄', onPress: () => {} },
  ];

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1">
        <View className="px-6 pt-4 pb-2">
          <Text className="text-gray-900 text-2xl font-bold">Account</Text>
        </View>

        {/* Profile Card */}
        <View className="mx-6 mt-4 mb-5 bg-indigo-600 rounded-2xl p-6 items-center">
          <View className="w-20 h-20 rounded-full bg-indigo-400 items-center justify-center mb-3">
            <Text className="text-white text-2xl font-bold">
              {user?.full_name ? getInitials(user.full_name) : '?'}
            </Text>
          </View>
          <Text className="text-white text-xl font-bold">{user?.full_name}</Text>
          <Text className="text-indigo-200 text-sm mt-1">{user?.email}</Text>
        </View>

        {/* Settings */}
        <View className="mx-6 bg-white rounded-2xl overflow-hidden border border-gray-100 mb-4">
          {settings.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              className={`flex-row items-center px-4 py-4 gap-3 ${index < settings.length - 1 ? 'border-b border-gray-100' : ''}`}
              onPress={item.onPress}
            >
              <Text className="text-xl w-8">{item.icon}</Text>
              <Text className="flex-1 text-gray-900 text-base font-medium">{item.label}</Text>
              <Text className="text-gray-400 text-lg">›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          className="mx-6 bg-white rounded-2xl p-4 flex-row items-center gap-3 border border-red-100 mb-8"
          onPress={confirmSignOut}
        >
          <Text className="text-xl w-8">👋</Text>
          <Text className="flex-1 text-red-500 text-base font-semibold">Sign Out</Text>
        </TouchableOpacity>

        <Text className="text-center text-gray-400 text-xs mb-8">SplitPay v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
