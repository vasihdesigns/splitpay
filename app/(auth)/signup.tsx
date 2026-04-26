import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, ScrollView, StyleSheet,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function SignupScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  async function handleSignup() {
    if (!fullName || !email || !password || !confirm) { Alert.alert('Error', 'Please fill in all fields'); return; }
    if (password !== confirm) { Alert.alert('Error', 'Passwords do not match'); return; }
    if (password.length < 6)  { Alert.alert('Error', 'Password must be at least 6 characters'); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    setLoading(false);
    if (error) { Alert.alert('Signup Failed', error.message); return; }
    if (data.user) await supabase.from('profiles').upsert({ id: data.user.id, email, full_name: fullName });
    Alert.alert('Success', 'Account created! Check your email to verify.', [
      { text: 'OK', onPress: () => router.replace('/(auth)/login') },
    ]);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.screen}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={s.container}>
          <View style={s.header}>
            <View style={s.logoBox}><Text style={s.logoText}>S</Text></View>
            <Text style={s.title}>Create Account</Text>
            <Text style={s.subtitle}>Join SplitPay today</Text>
          </View>
          <View style={s.form}>
            {[
              { label: 'Full Name', value: fullName, onChange: setFullName, placeholder: 'John Doe', secure: false, keyboard: 'default' as const, cap: 'words' as const },
              { label: 'Email', value: email, onChange: setEmail, placeholder: 'you@example.com', secure: false, keyboard: 'email-address' as const, cap: 'none' as const },
              { label: 'Password', value: password, onChange: setPassword, placeholder: '••••••••', secure: true, keyboard: 'default' as const, cap: 'none' as const },
              { label: 'Confirm Password', value: confirm, onChange: setConfirm, placeholder: '••••••••', secure: true, keyboard: 'default' as const, cap: 'none' as const },
            ].map((f) => (
              <View key={f.label} style={s.field}>
                <Text style={s.label}>{f.label}</Text>
                <TextInput
                  style={s.input}
                  placeholder={f.placeholder}
                  placeholderTextColor="#9ca3af"
                  value={f.value}
                  onChangeText={f.onChange}
                  secureTextEntry={f.secure}
                  keyboardType={f.keyboard}
                  autoCapitalize={f.cap}
                />
              </View>
            ))}
            <TouchableOpacity style={s.btn} onPress={handleSignup} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Create Account</Text>}
            </TouchableOpacity>
          </View>
          <View style={s.footer}>
            <Text style={s.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login"><Text style={s.link}>Sign In</Text></Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: '#ffffff' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  header:    { alignItems: 'center', marginBottom: 32 },
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
