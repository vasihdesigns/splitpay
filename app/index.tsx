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
      // Try anonymous sign-in so user skips login screen
      signInAnonymously().then((ok) => {
        if (ok) {
          router.replace('/(tabs)/home');
        } else {
          // Anonymous auth not enabled — fall back to login
          router.replace('/(auth)/login');
        }
      });
    }
  }, [loading, session]);

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#4f46e5" />
    </View>
  );
}
