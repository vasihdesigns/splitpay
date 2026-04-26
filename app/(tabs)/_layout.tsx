import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View className="items-center pt-1">
      <Text style={{ fontSize: 20 }}>{emoji}</Text>
      <Text
        style={{ fontSize: 11, marginTop: 2, fontWeight: focused ? '600' : '400', color: focused ? '#4f46e5' : '#9ca3af' }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#f1f5f9',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          elevation: 0,
          shadowOpacity: 0.05,
          shadowRadius: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" label="Home" focused={focused} /> }}
      />
      <Tabs.Screen
        name="groups"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="👥" label="Groups" focused={focused} /> }}
      />
      <Tabs.Screen
        name="activity"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🔔" label="Activity" focused={focused} /> }}
      />
      <Tabs.Screen
        name="account"
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="👤" label="Account" focused={focused} /> }}
      />
    </Tabs>
  );
}
