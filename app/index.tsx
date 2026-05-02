import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function Index() {
  const { session, loading, signInAnonymously } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (session) {
      router.replace('/(tabs)/home');
    } else {
      // Try anonymous sign-in, then go straight to home either way
      signInAnonymously().finally(() => {
        router.replace('/(tabs)/home');
      });
    }
  }, [loading, session]);

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#4f46e5" />
    </View>
  );
}
