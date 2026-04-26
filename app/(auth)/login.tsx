import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) { Alert.alert('Error', 'Please fill in all fields'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Login Failed', error.message);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.screen}>
      <View style={s.container}>
        {/* Logo */}
        <View style={s.header}>
          <View style={s.logoBox}>
            <Text style={s.logoText}>S</Text>
          </View>
          <Text style={s.title}>SplitPay</Text>
          <Text style={s.subtitle}>Split expenses, not friendships</Text>
        </View>

        {/* Form */}
        <View style={s.form}>
          <View style={s.field}>
            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              placeholder="you@example.com"
              placeholderTextColor="#9ca3af"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={s.field}>
            <Text style={s.label}>Password</Text>
            <TextInput
              style={s.input}
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
          <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Sign In</Text>}
          </TouchableOpacity>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/signup"><Text style={s.link}>Sign Up</Text></Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: '#ffffff' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  header:    { alignItems: 'center', marginBottom: 40 },
  logoBox:   { width: 64, height: 64, borderRadius: 16, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoText:  { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  title:     { color: '#111827', fontSize: 28, fontWeight: 'bold' },
  subtitle:  { color: '#6b7280', fontSize: 15, marginTop: 4 },
  form:      { gap: 16 },
  field:     { gap: 6 },
  label:     { color: '#374151', fontSize: 14, fontWeight: '600' },
  input:     { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#111827' },
  btn:       { backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnText:   { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  footer:    { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText:{ color: '#6b7280' },
  link:      { color: '#4f46e5', fontWeight: 'bold' },
});
