import { View, Text, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { getInitials } from '@/lib/utils';

interface SettingsRow {
  label: string;
  icon: string;
  onPress: () => void;
  destructive?: boolean;
}

export default function AccountScreen() {
  const { user, signOut } = useAuthStore();

  function confirmSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }

  const settings: SettingsRow[] = [
    { label: 'Edit Profile', icon: '✏️', onPress: () => {} },
    { label: 'Notifications', icon: '🔔', onPress: () => {} },
    { label: 'Currency', icon: '💱', onPress: () => {} },
    { label: 'Privacy Policy', icon: '🔒', onPress: () => {} },
    { label: 'Terms of Service', icon: '📄', onPress: () => {} },
    { label: 'Sign Out', icon: '👋', onPress: confirmSignOut, destructive: true },
  ];

  return (
    <SafeAreaView className="flex-1 bg-primary-950">
      <ScrollView className="flex-1">
        {/* Header */}
        <View className="px-6 pt-4 pb-6">
          <Text className="text-white text-2xl font-bold">Account</Text>
        </View>

        {/* Profile Card */}
        <View className="mx-6 mb-6 bg-primary-900 rounded-2xl p-6 items-center">
          <View className="w-20 h-20 rounded-full bg-primary-600 items-center justify-center mb-3">
            <Text className="text-white text-2xl font-bold">
              {user?.full_name ? getInitials(user.full_name) : '?'}
            </Text>
          </View>
          <Text className="text-white text-xl font-bold">{user?.full_name}</Text>
          <Text className="text-primary-400 text-sm mt-1">{user?.email}</Text>
        </View>

        {/* Settings */}
        <View className="mx-6 bg-primary-900 rounded-2xl overflow-hidden">
          {settings.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              className={`flex-row items-center px-4 py-4 gap-3 ${
                index < settings.length - 1 ? 'border-b border-primary-800' : ''
              }`}
              onPress={item.onPress}
            >
              <Text className="text-xl w-8">{item.icon}</Text>
              <Text
                className={`flex-1 text-base font-medium ${
                  item.destructive ? 'text-danger' : 'text-white'
                }`}
              >
                {item.label}
              </Text>
              {!item.destructive && (
                <Text className="text-primary-500">›</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Version */}
        <Text className="text-center text-primary-600 text-xs mt-6 mb-8">
          SplitPay v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
