import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Login Failed', error.message);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-primary-950"
    >
      <View className="flex-1 justify-center px-6">
        {/* Logo / Header */}
        <View className="mb-10 items-center">
          <View className="w-16 h-16 rounded-2xl bg-primary-500 items-center justify-center mb-4">
            <Text className="text-white text-3xl font-bold">S</Text>
          </View>
          <Text className="text-white text-3xl font-bold">SplitPay</Text>
          <Text className="text-primary-300 text-base mt-1">Split expenses, not friendships</Text>
        </View>

        {/* Form */}
        <View className="bg-primary-900 rounded-2xl p-6 gap-4">
          <View>
            <Text className="text-primary-300 text-sm mb-1 font-medium">Email</Text>
            <TextInput
              className="bg-primary-800 text-white rounded-xl px-4 py-3 text-base"
              placeholder="you@example.com"
              placeholderTextColor="#6366f1"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View>
            <Text className="text-primary-300 text-sm mb-1 font-medium">Password</Text>
            <TextInput
              className="bg-primary-800 text-white rounded-xl px-4 py-3 text-base"
              placeholder="••••••••"
              placeholderTextColor="#6366f1"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            className="bg-primary-500 rounded-xl py-4 items-center mt-2"
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-base">Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View className="mt-6 flex-row justify-center">
          <Text className="text-primary-400">Don't have an account? </Text>
          <Link href="/(auth)/signup">
            <Text className="text-primary-300 font-bold">Sign Up</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
