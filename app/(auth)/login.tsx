import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { useTheme, ThemeColors } from '@/lib/theme';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const t = useTheme();
  const router = useRouter();
  const s = useMemo(() => makeStyles(t), [t]);
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);

  async function handleLogin() {
    if (!email || !password) { Alert.alert('Error', 'Please fill in all fields'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Login Failed', error.message);
    } else {
      router.replace('/(tabs)/home');
    }
  }

  async function handleForgotPassword() {
    const trimmed = email.trim();
    if (!trimmed) { Alert.alert('Enter your email', 'Type your email address above, then tap Forgot password.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Check your inbox', `A password reset link has been sent to ${trimmed}.`);
    }
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    setOauthLoading(provider);
    try {
      const redirectUrl = Linking.createURL('/');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });
      if (error || !data?.url) {
        Alert.alert('OAuth Error', error?.message ?? 'Could not start sign-in. Make sure this provider is enabled in Supabase.');
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        if (code) {
          const { error: sessionErr } = await supabase.auth.exchangeCodeForSession(code);
          if (sessionErr) {
            Alert.alert('Error', sessionErr.message);
          } else {
            router.replace('/(tabs)/home');
          }
        }
      }
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[s.screen, { backgroundColor: t.bg }]}>
      <View style={s.container}>
        {/* Logo */}
        <View style={s.header}>
          <View style={s.logoBox}>
            <Text style={s.logoText}>S</Text>
          </View>
          <Text style={s.title}>SplitPay</Text>
          <Text style={s.subtitle}>Split expenses, not friendships</Text>
        </View>

        {/* OAuth Buttons */}
        <View style={s.oauthRow}>
          <TouchableOpacity
            style={s.oauthBtn}
            onPress={() => handleOAuth('google')}
            disabled={!!oauthLoading || loading}
          >
            {oauthLoading === 'google'
              ? <ActivityIndicator color={t.text} size="small" />
              : <><Text style={s.oauthIcon}>G</Text><Text style={s.oauthText}>Google</Text></>

            }
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.oauthBtn, s.oauthBtnDark]}
            onPress={() => handleOAuth('apple')}
            disabled={!!oauthLoading || loading}
          >
            {oauthLoading === 'apple'
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Text style={[s.oauthIcon, { color: '#fff' }]}>🍎</Text><Text style={[s.oauthText, { color: '#fff' }]}>Apple</Text></>
            }
          </TouchableOpacity>
        </View>

        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or sign in with email</Text>
          <View style={s.dividerLine} />
        </View>

        {/* Email / Password Form */}
        <View style={s.form}>
          <View style={s.field}>
            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              placeholder="you@example.com"
              placeholderTextColor={t.placeholder}
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
              placeholderTextColor={t.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
          <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading || !!oauthLoading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Sign In</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleForgotPassword} disabled={loading || !!oauthLoading} style={s.forgotBtn}>
            <Text style={s.forgotText}>Forgot password?</Text>
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

function makeStyles(t: ThemeColors) { return StyleSheet.create({
  screen:       { flex: 1, backgroundColor: t.bg },
  container:    { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  header:       { alignItems: 'center', marginBottom: 32 },
  logoBox:      { width: 64, height: 64, borderRadius: 16, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoText:     { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  title:        { color: t.text, fontSize: 28, fontWeight: 'bold' },
  subtitle:     { color: t.subtext, fontSize: 15, marginTop: 4 },
  oauthRow:     { flexDirection: 'row', gap: 12, marginBottom: 20 },
  oauthBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingVertical: 14, backgroundColor: t.card },
  oauthBtnDark: { backgroundColor: '#111827', borderColor: '#111827' }, // Apple button always dark
  oauthIcon:    { fontSize: 16, fontWeight: 'bold', color: t.text },
  oauthText:    { color: t.text, fontWeight: '600', fontSize: 15 },
  divider:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  dividerLine:  { flex: 1, height: 1, backgroundColor: t.border },
  dividerText:  { color: t.placeholder, fontSize: 13 },
  form:         { gap: 16 },
  field:        { gap: 6 },
  label:        { color: t.text, fontSize: 14, fontWeight: '600' },
  input:        { backgroundColor: t.inputBg, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: t.text },
  btn:          { backgroundColor: t.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnText:      { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  forgotBtn:    { alignItems: 'center', paddingVertical: 8 },
  forgotText:   { color: t.primary, fontSize: 14 },
  footer:       { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText:   { color: t.subtext },
  link:         { color: t.primary, fontWeight: 'bold' },
});}
