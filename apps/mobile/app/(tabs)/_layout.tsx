import { View, Text, TouchableOpacity } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';

const TAB_ITEMS = [
  { name: 'index',       label: 'Home',     icon: '🎮' },
  { name: 'leaderboard', label: 'Ranks',    icon: '🏆' },
  { name: 'profile',     label: 'Profile',  icon: '👤' },
  { name: 'settings',    label: 'Settings', icon: '⚙️' },
] as const;

function SidebarNavigator() {
  const pathname = usePathname();

  return (
    <View style={{ flexDirection: 'row', flex: 1 }}>
      <View style={{ width: 220, backgroundColor: '#111827', borderRightWidth: 1, borderRightColor: '#1f2937', paddingTop: 16 }}>
        <View style={{ paddingHorizontal: 16, marginBottom: 32 }}>
          <Text style={{ color: '#f9fafb', fontFamily: 'SpaceGrotesk-Bold', fontSize: 22 }}>Puzzle Roll</Text>
        </View>
        {TAB_ITEMS.map((item) => {
          const isActive = pathname === `/${item.name}` || (item.name === 'index' && pathname === '/');
          return (
            <TouchableOpacity
              key={item.name}
              onPress={() => router.push(item.name === 'index' ? '/' : `/${item.name}` as never)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                marginHorizontal: 8, paddingHorizontal: 16, paddingVertical: 12,
                borderRadius: 12, marginBottom: 4,
                backgroundColor: isActive ? '#1f2937' : 'transparent',
              }}
              accessibilityLabel={item.label}
              accessibilityRole="menuitem"
            >
              <Text style={{ fontSize: 18 }}>{item.icon}</Text>
              <Text style={{
                fontFamily: 'SpaceGrotesk-Medium', fontSize: 15,
                color: isActive ? '#f9fafb' : '#9ca3af',
              }}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flex: 1 }}>
        <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }} />
      </View>
    </View>
  );
}

function BottomTabBar() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#111827',
          borderTopColor: '#1f2937',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#6b7280',
        tabBarLabelStyle: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 10 },
      }}
    >
      {TAB_ITEMS.map((item) => (
        <Tabs.Screen
          key={item.name}
          name={item.name}
          options={{
            title: item.label,
            tabBarIcon: ({ focused }) => (
              <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{item.icon}</Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

export default function TabsLayout() {
  const { isTablet } = useBreakpoint();

  if (isTablet) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#060818' }} edges={['top']}>
        <SidebarNavigator />
      </SafeAreaView>
    );
  }

  return <BottomTabBar />;
}