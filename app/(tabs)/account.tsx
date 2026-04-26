import { View, Text, TouchableOpacity, Alert, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { getInitials } from '@/lib/utils';

export default function AccountScreen() {
  const { user, signOut } = useAuthStore();

  const settings = [
    { label: 'Edit Profile',    icon: '✏️', onPress: () => {} },
    { label: 'Notifications',   icon: '🔔', onPress: () => {} },
    { label: 'Currency',        icon: '💱', onPress: () => {} },
    { label: 'Privacy Policy',  icon: '🔒', onPress: () => {} },
    { label: 'Terms of Service',icon: '📄', onPress: () => {} },
  ];

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={s.topBar}><Text style={s.pageTitle}>Account</Text></View>

        {/* Profile Card */}
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{user?.full_name ? getInitials(user.full_name) : '?'}</Text>
          </View>
          <Text style={s.profileName}>{user?.full_name}</Text>
          <Text style={s.profileEmail}>{user?.email}</Text>
        </View>

        {/* Settings */}
        <View style={s.settingsCard}>
          {settings.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[s.settingsRow, i < settings.length - 1 && s.settingsBorder]}
              onPress={item.onPress}
            >
              <Text style={s.settingsIcon}>{item.icon}</Text>
              <Text style={s.settingsLabel}>{item.label}</Text>
              <Text style={s.settingsChevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={s.signOutBtn}
          onPress={() => Alert.alert('Sign Out', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: signOut },
          ])}
        >
          <Text style={s.settingsIcon}>👋</Text>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={s.version}>SplitPay v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: '#f8fafc' },
  topBar:         { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  pageTitle:      { color: '#111827', fontSize: 24, fontWeight: 'bold' },
  profileCard:    { marginHorizontal: 24, marginTop: 16, marginBottom: 20, backgroundColor: '#4f46e5', borderRadius: 20, padding: 24, alignItems: 'center' },
  avatar:         { width: 80, height: 80, borderRadius: 40, backgroundColor: '#818cf8', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText:     { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  profileName:    { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  profileEmail:   { color: '#c7d2fe', fontSize: 14, marginTop: 4 },
  settingsCard:   { marginHorizontal: 24, backgroundColor: '#ffffff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#f1f5f9', marginBottom: 12 },
  settingsRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 },
  settingsBorder: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  settingsIcon:   { fontSize: 20, width: 32 },
  settingsLabel:  { flex: 1, color: '#111827', fontSize: 16, fontWeight: '500' },
  settingsChevron:{ color: '#9ca3af', fontSize: 18 },
  signOutBtn:     { marginHorizontal: 24, backgroundColor: '#ffffff', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#fee2e2' },
  signOutText:    { flex: 1, color: '#dc2626', fontSize: 16, fontWeight: '600' },
  version:        { textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 24 },
});
