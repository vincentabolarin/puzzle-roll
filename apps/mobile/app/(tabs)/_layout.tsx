import { View, Text, TouchableOpacity } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { useAppTheme } from '../../src/hooks/useAppTheme';

const TAB_ITEMS = [
  { name: 'index',       label: 'Home',     icon: '🎮' },
  { name: 'leaderboard', label: 'Ranks',    icon: '🏆' },
  { name: 'profile',     label: 'Profile',  icon: '👤' },
  { name: 'settings',    label: 'Settings', icon: '⚙️' },
] as const;

// Shared Tabs.Screen declarations — used in both navigators so Expo Router
// never sees undeclared screens (which causes "Too many screens" warnings).
function TabScreens() {
  return (
    <>
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
    </>
  );
}

function SidebarNavigator() {
  const pathname = usePathname();
  const t = useAppTheme();

  return (
    <View style={{ flexDirection: 'row', flex: 1 }}>
      <View style={{ width: 220, backgroundColor: t.surface, borderRightWidth: 1, borderRightColor: t.borderSubtle, paddingTop: 16 }}>
        <View style={{ paddingHorizontal: 16, marginBottom: 32 }}>
          <Text style={{ color: t.textPrimary, fontFamily: 'SpaceGrotesk-Bold', fontSize: 22 }}>Puzzle Roll</Text>
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
                backgroundColor: isActive ? t.surface2 : 'transparent',
              }}
              accessibilityLabel={item.label}
              accessibilityRole="menuitem"
            >
              <Text style={{ fontSize: 18 }}>{item.icon}</Text>
              <Text style={{
                fontFamily: 'SpaceGrotesk-Medium', fontSize: 15,
                color: isActive ? t.textPrimary : t.textSecondary,
              }}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flex: 1 }}>
        {/* Explicit Tabs.Screen declarations prevent "Too many screens" warning */}
        <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
          <TabScreens />
        </Tabs>
      </View>
    </View>
  );
}

function BottomTabBar() {
  const t = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.borderSubtle,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: t.textMuted,
        tabBarLabelStyle: { fontFamily: 'SpaceGrotesk-Medium', fontSize: 10 },
      }}
    >
      <TabScreens />
    </Tabs>
  );
}

export default function TabsLayout() {
  const { isTablet } = useBreakpoint();
  const t = useAppTheme();

  if (isTablet) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background }} edges={['top']}>
        <SidebarNavigator />
      </SafeAreaView>
    );
  }

  return <BottomTabBar />;
}