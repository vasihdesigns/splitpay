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
  ScrollView,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function SignupScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignup() {
    if (!fullName || !email || !password || !confirm) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);

    if (error) {
      Alert.alert('Signup Failed', error.message);
      return;
    }

    // Insert profile row
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        full_name: fullName,
      });
    }

    Alert.alert('Success', 'Account created! Please check your email to verify.', [
      { text: 'OK', onPress: () => router.replace('/(auth)/login') },
    ]);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-primary-950"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="flex-1">
        <View className="flex-1 justify-center px-6 py-10">
          {/* Header */}
          <View className="mb-8 items-center">
            <View className="w-16 h-16 rounded-2xl bg-primary-500 items-center justify-center mb-4">
              <Text className="text-white text-3xl font-bold">S</Text>
            </View>
            <Text className="text-white text-3xl font-bold">Create Account</Text>
            <Text className="text-primary-300 text-base mt-1">Join SplitPay today</Text>
          </View>

          {/* Form */}
          <View className="bg-primary-900 rounded-2xl p-6 gap-4">
            <View>
              <Text className="text-primary-300 text-sm mb-1 font-medium">Full Name</Text>
              <TextInput
                className="bg-primary-800 text-white rounded-xl px-4 py-3 text-base"
                placeholder="John Doe"
                placeholderTextColor="#6366f1"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />
            </View>

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

            <View>
              <Text className="text-primary-300 text-sm mb-1 font-medium">Confirm Password</Text>
              <TextInput
                className="bg-primary-800 text-white rounded-xl px-4 py-3 text-base"
                placeholder="••••••••"
                placeholderTextColor="#6366f1"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              className="bg-primary-500 rounded-xl py-4 items-center mt-2"
              onPress={handleSignup}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-base">Create Account</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View className="mt-6 flex-row justify-center">
            <Text className="text-primary-400">Already have an account? </Text>
            <Link href="/(auth)/login">
              <Text className="text-primary-300 font-bold">Sign In</Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
