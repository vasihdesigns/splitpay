import { Tabs, useRouter } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ThemeColors } from '@/lib/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, activeName, label, focused }: {
  name: IoniconsName; activeName: IoniconsName; label: string; focused: boolean;
}) {
  const t = useTheme();
  const s = makeStyles(t);
  return (
    <View style={s.iconWrap}>
      <Ionicons name={focused ? activeName : name} size={24} color={focused ? t.primary : t.placeholder} />
      <Text style={[s.iconLabel, focused && s.iconLabelActive]}>{label}</Text>
    </View>
  );
}

function AddExpenseFAB() {
  const router = useRouter();
  const t = useTheme();
  return (
    <TouchableOpacity
      style={[styles.fab, { backgroundColor: t.primary, shadowColor: t.primary }]}
      onPress={() => router.push('/add-expense')}
      activeOpacity={0.85}
    >
      <Ionicons name="add-circle-outline" size={22} color="#fff" />
      <Text style={styles.fabText}>Add expense</Text>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: t.tabBar, borderTopColor: t.tabBarBorder, borderTopWidth: 1, height: 64, paddingBottom: 8, elevation: 0 },
        tabBarShowLabel: false,
      }}>
        <Tabs.Screen name="home"     options={{ tabBarIcon: ({ focused }) => <TabIcon name="grid-outline"            activeName="grid"          label="Dashboard" focused={focused} /> }} />
        <Tabs.Screen name="friends"  options={{ tabBarIcon: ({ focused }) => <TabIcon name="person-outline"         activeName="person"        label="Friends"   focused={focused} /> }} />
        <Tabs.Screen name="groups"   options={{ tabBarIcon: ({ focused }) => <TabIcon name="people-outline"         activeName="people"        label="Groups"    focused={focused} /> }} />
        <Tabs.Screen name="account"  options={{ tabBarIcon: ({ focused }) => <TabIcon name="person-circle-outline"  activeName="person-circle" label="Account"   focused={focused} /> }} />
        {/* Hidden tabs — not shown in tab bar */}
        <Tabs.Screen name="activity" options={{ href: null }} />
        <Tabs.Screen name="expenses" options={{ href: null }} />
      </Tabs>

      {/* Floating Add Expense button — sits above all tabs */}
      <AddExpenseFAB />
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 82,           // sits just above the 64px tab bar + some breathing room
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    gap: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  fabText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});

function makeStyles(t: ThemeColors) {
  return StyleSheet.create({
    iconWrap:        { alignItems: 'center', paddingTop: 4, minWidth: 60 },
    iconLabel:       { fontSize: 11, marginTop: 2, color: t.placeholder, fontWeight: '400' },
    iconLabelActive: { color: t.primary, fontWeight: '600' },
  });
}
