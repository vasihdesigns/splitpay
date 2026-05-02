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
      // Sign in anonymously so user always has a session before using the app
      signInAnonymously().then((ok) => {
        // Whether it succeeded or not, proceed to home
        // If it failed, user will be prompted when they try to save data
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
