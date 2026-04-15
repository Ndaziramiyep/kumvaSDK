import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../store/store';

import DashboardScreen from '../screens/Dashboard/DashboardScreen';
import ScannerScreen from '../screens/AddDevice/ScannerScreen';
import DeviceConfigScreen from '../screens/AddDevice/DeviceConfigScreen';
import DeviceDetailScreen from '../screens/DeviceDetail/DeviceDetailScreen';
import IncidentsScreen from '../screens/Incidents/IncidentsScreen';
import ReportsScreen from '../screens/Reports/ReportsScreen';
import NotificationsScreen from '../screens/Notifications/NotificationsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Tabs() {
  const hasDevices = useAppStore(s => s.devices.length > 0);

  const insets = useSafeAreaInsets();
  const tabBarStyle = hasDevices
    ? {
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
        height: 64 + insets.bottom,
        paddingBottom: 10 + insets.bottom,
        paddingTop: 8,
      }
    : { display: 'none' as const };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#5C6BC0',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Dashboard: 'grid-outline',
            Reports: 'bar-chart-outline',
            Incidents: 'warning-outline',
          };
          return <Ionicons name={icons[route.name] ?? 'ellipse-outline'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="Incidents" component={IncidentsScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={Tabs} />
        <Stack.Screen name="AddDevice" component={ScannerScreen} />
        <Stack.Screen name="Scanner" component={ScannerScreen} />
        <Stack.Screen name="DeviceConfig" component={DeviceConfigScreen} />
        <Stack.Screen name="DeviceDetail" component={DeviceDetailScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
