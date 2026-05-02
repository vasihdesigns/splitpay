import { useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
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

function AddExpenseFAB({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <TouchableOpacity
      style={[styles.fab, { backgroundColor: t.primary, shadowColor: t.primary }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Ionicons name="add-circle-outline" size={22} color="#fff" />
      <Text style={styles.fabText}>Add expense</Text>
    </TouchableOpacity>
  );
}

const CONTEXT_OPTIONS = [
  {
    key:      'people',
    icon:     'person-add-outline' as IoniconsName,
    label:    'With a friend',
    sub:      'Split a bill one-on-one',
    iconBg:   '#ede9fe',
    iconColor:'#7c3aed',
  },
  {
    key:      'group',
    icon:     'people-outline' as IoniconsName,
    label:    'In a group',
    sub:      'Add to a group expense',
    iconBg:   '#dbeafe',
    iconColor:'#2563eb',
  },
  {
    key:      'solo',
    icon:     'create-outline' as IoniconsName,
    label:    'Personal expense',
    sub:      'Track something paid just by you',
    iconBg:   '#dcfce7',
    iconColor:'#16a34a',
  },
];

export default function TabsLayout() {
  const t = useTheme();
  const router = useRouter();
  const [showSheet, setShowSheet] = useState(false);

  function handleOption(key: string) {
    setShowSheet(false);
    router.push({ pathname: '/add-expense', params: { autoOpen: key } });
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: t.tabBar, borderTopColor: t.tabBarBorder, borderTopWidth: 1, height: 64, paddingBottom: 8, elevation: 0 },
        tabBarShowLabel: false,
      }}>
        <Tabs.Screen name="home"     options={{ tabBarIcon: ({ focused }) => <TabIcon name="grid-outline"           activeName="grid"          label="Dashboard" focused={focused} /> }} />
        <Tabs.Screen name="friends"  options={{ tabBarIcon: ({ focused }) => <TabIcon name="person-outline"         activeName="person"        label="Friends"   focused={focused} /> }} />
        <Tabs.Screen name="groups"   options={{ tabBarIcon: ({ focused }) => <TabIcon name="people-outline"         activeName="people"        label="Groups"    focused={focused} /> }} />
        <Tabs.Screen name="account"  options={{ tabBarIcon: ({ focused }) => <TabIcon name="person-circle-outline"  activeName="person-circle" label="Account"   focused={focused} /> }} />
        {/* Hidden tabs — not shown in tab bar */}
        <Tabs.Screen name="activity" options={{ href: null }} />
        <Tabs.Screen name="expenses" options={{ href: null }} />
      </Tabs>

      {/* Floating Add Expense button */}
      <AddExpenseFAB onPress={() => setShowSheet(true)} />

      {/* Context bottom sheet */}
      <Modal
        visible={showSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSheet(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowSheet(false)}
        >
          <View style={[styles.sheet, { backgroundColor: t.card }]}>
            {/* Handle */}
            <View style={[styles.handle, { backgroundColor: t.border }]} />

            <Text style={[styles.sheetTitle, { color: t.text }]}>Add an expense</Text>

            {CONTEXT_OPTIONS.map((opt, i) => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.optionRow,
                  i < CONTEXT_OPTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border },
                ]}
                onPress={() => handleOption(opt.key)}
                activeOpacity={0.72}
              >
                <View style={[styles.optionIconBox, { backgroundColor: opt.iconBg }]}>
                  <Ionicons name={opt.icon} size={22} color={opt.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, { color: t.text }]}>{opt.label}</Text>
                  <Text style={[styles.optionSub, { color: t.subtext }]}>{opt.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={t.placeholder} />
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.cancelBtn, { backgroundColor: t.inputBg }]}
              onPress={() => setShowSheet(false)}
              activeOpacity={0.75}
            >
              <Text style={[styles.cancelText, { color: t.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 82,
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

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 14,
  },
  optionIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  optionSub:   { fontSize: 13 },
  cancelBtn: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '600' },
});

function makeStyles(t: ThemeColors) {
  return StyleSheet.create({
    iconWrap:        { alignItems: 'center', paddingTop: 4, minWidth: 60 },
    iconLabel:       { fontSize: 11, marginTop: 2, color: t.placeholder, fontWeight: '400' },
    iconLabelActive: { color: t.primary, fontWeight: '600' },
  });
}
