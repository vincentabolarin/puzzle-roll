import { View, Text, TouchableOpacity } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBreakpoint } from '../../src/hooks/useBreakpoint';
import { useAuthStore } from '../../src/stores/auth.store';

const TAB_ITEMS = [
  { name: 'index', label: 'Home', icon: '🎮' },
  { name: 'leaderboard', label: 'Ranks', icon: '🏆' },
  { name: 'profile', label: 'Profile', icon: '👤' },
] as const;

function SidebarNavigator() {
  const pathname = usePathname();

  return (
    <View className="flex-row flex-1">
      {/* Sidebar */}
      <View className="w-56 bg-surface border-r border-border-subtle pt-4">
        <View className="px-4 mb-8">
          <Text className="text-text-primary font-sans-bold text-2xl">Puzzle Roll</Text>
        </View>
        {TAB_ITEMS.map((item) => {
          const isActive = pathname === `/${item.name}` || (item.name === 'index' && pathname === '/');
          return (
            <TouchableOpacity
              key={item.name}
              onPress={() => router.push(item.name === 'index' ? '/' : `/${item.name}`)}
              className={`flex-row items-center gap-3 mx-2 px-4 py-3 rounded-xl mb-1 ${
                isActive ? 'bg-surface-2' : ''
              }`}
              accessibilityLabel={item.label}
              accessibilityRole="menuitem"
            >
              <Text className="text-xl">{item.icon}</Text>
              <Text
                className={`font-sans-medium text-base ${
                  isActive ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Main content */}
      <View className="flex-1">
        <Tabs
          screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
        />
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
          borderTopColor: '#374151',
          borderTopWidth: 1,
          paddingBottom: 4,
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
              <Text className={`text-xl ${focused ? 'opacity-100' : 'opacity-50'}`}>
                {item.icon}
              </Text>
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
      <SafeAreaView className="flex-1 bg-navy-950" edges={['top']}>
        <SidebarNavigator />
      </SafeAreaView>
    );
  }

  return <BottomTabBar />;
}
