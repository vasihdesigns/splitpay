import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, ScrollView, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export default function CreateAccountScreen() {
  const router = useRouter();
  const { user, fetchProfile } = useAuthStore();
  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleCreate() {
    if (!fullName.trim() || !email.trim() || !password || !confirm) {
      Alert.alert('Error', 'Please fill in all fields'); return;
    }
    if (password !== confirm) {
      Alert.alert('Error', 'Passwords do not match'); return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters'); return;
    }

    setLoading(true);

    // Convert anonymous account → real account by adding email + password
    const { error } = await supabase.auth.updateUser({
      email: email.trim(),
      password,
      data: { full_name: fullName.trim() },
    });

    if (error) {
      Alert.alert('Error', error.message);
      setLoading(false);
      return;
    }

    // Save profile
    await supabase.from('profiles').upsert({
      id: user?.id,
      email: email.trim(),
      full_name: fullName.trim(),
    });

    // Refresh local profile
    if (user?.id) await fetchProfile(user.id);

    setLoading(false);
    Alert.alert(
      'Account Created! 🎉',
      'Check your email to verify your address. You can keep using the app in the meantime.',
      [{ text: 'OK', onPress: () => router.back() }],
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
              <Text style={s.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.title}>Create Account</Text>
            <View style={{ width: 64 }} />
          </View>

          <View style={s.body}>
            {/* Hero */}
            <View style={s.hero}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>🔐</Text>
              <Text style={s.heroTitle}>Save your data & share expenses</Text>
              <Text style={s.heroSub}>
                Creating an account lets you invite friends, split bills, and access your data from any device.
              </Text>
            </View>

            {/* Form */}
            <View style={s.form}>
              {[
                { label: 'Full Name', value: fullName, set: setFullName, placeholder: 'John Doe',          secure: false, keyboard: 'default' as const,        cap: 'words' as const },
                { label: 'Email',     value: email,    set: setEmail,    placeholder: 'you@example.com', secure: false, keyboard: 'email-address' as const, cap: 'none' as const  },
                { label: 'Password',  value: password, set: setPassword, placeholder: '••••••••',        secure: true,  keyboard: 'default' as const,        cap: 'none' as const  },
                { label: 'Confirm',   value: confirm,  set: setConfirm,  placeholder: '••••••••',        secure: true,  keyboard: 'default' as const,        cap: 'none' as const  },
              ].map((f) => (
                <View key={f.label} style={s.field}>
                  <Text style={s.label}>{f.label}</Text>
                  <TextInput
                    style={s.input}
                    placeholder={f.placeholder}
                    placeholderTextColor="#9ca3af"
                    value={f.value}
                    onChangeText={f.set}
                    secureTextEntry={f.secure}
                    keyboardType={f.keyboard}
                    autoCapitalize={f.cap}
                  />
                </View>
              ))}

              <TouchableOpacity style={s.btn} onPress={handleCreate} disabled={loading}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Create Account</Text>
                }
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>already have an account?</Text>
              <View style={s.dividerLine} />
            </View>

            <TouchableOpacity
              style={s.signInBtn}
              onPress={() => router.replace('/(auth)/login')}
            >
              <Text style={s.signInText}>Sign In Instead</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: '#f8fafc' },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 4, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  cancel:      { color: '#4f46e5', fontSize: 16, fontWeight: '600', paddingHorizontal: 8 },
  title:       { flex: 1, textAlign: 'center', color: '#111827', fontSize: 18, fontWeight: 'bold' },
  body:        { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  hero:        { backgroundColor: '#eef2ff', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 28 },
  heroTitle:   { color: '#111827', fontWeight: 'bold', fontSize: 17, textAlign: 'center', marginBottom: 8 },
  heroSub:     { color: '#6b7280', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  form:        { gap: 16 },
  field:       { gap: 6 },
  label:       { color: '#374151', fontSize: 14, fontWeight: '600' },
  input:       { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#111827' },
  btn:         { backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnText:     { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  divider:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  dividerText: { color: '#9ca3af', fontSize: 13 },
  signInBtn:   { borderWidth: 1, borderColor: '#4f46e5', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  signInText:  { color: '#4f46e5', fontWeight: '600', fontSize: 15 },
});
