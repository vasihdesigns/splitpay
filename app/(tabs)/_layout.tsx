import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={s.iconWrap}>
      <Text style={{ fontSize: 20 }}>{emoji}</Text>
      <Text style={[s.iconLabel, focused && s.iconLabelActive]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: s.tabBar,
      tabBarShowLabel: false,
    }}>
      <Tabs.Screen name="home"     options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" label="Home"     focused={focused} /> }} />
      <Tabs.Screen name="groups"   options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="👥" label="Groups"   focused={focused} /> }} />
      <Tabs.Screen name="activity" options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🔔" label="Activity" focused={focused} /> }} />
      <Tabs.Screen name="account"  options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="👤" label="Account"  focused={focused} /> }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  tabBar:          { backgroundColor: '#ffffff', borderTopColor: '#f1f5f9', borderTopWidth: 1, height: 64, paddingBottom: 8, elevation: 0 },
  iconWrap:        { alignItems: 'center', paddingTop: 4 },
  iconLabel:       { fontSize: 11, marginTop: 2, color: '#9ca3af', fontWeight: '400' },
  iconLabelActive: { color: '#4f46e5', fontWeight: '600' },
});
