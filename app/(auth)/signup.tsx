import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, ScrollView, StyleSheet,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme, ThemeColors } from '@/lib/theme';

export default function SignupScreen() {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[s.screen, { backgroundColor: t.bg }]}>
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
                  placeholderTextColor={t.placeholder}
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

function makeStyles(t: ThemeColors) { return StyleSheet.create({
  screen:    { flex: 1, backgroundColor: t.bg },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  header:    { alignItems: 'center', marginBottom: 32 },
  logoBox:   { width: 64, height: 64, borderRadius: 16, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoText:  { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  title:     { color: t.text, fontSize: 28, fontWeight: 'bold' },
  subtitle:  { color: t.subtext, fontSize: 15, marginTop: 4 },
  form:      { gap: 16 },
  field:     { gap: 6 },
  label:     { color: t.text, fontSize: 14, fontWeight: '600' },
  input:     { backgroundColor: t.inputBg, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: t.text },
  btn:       { backgroundColor: t.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnText:   { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  footer:    { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText:{ color: t.subtext },
  link:      { color: t.primary, fontWeight: 'bold' },
});}
