import React, { useEffect } from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { getDB } from './src/database/db';
import { requestNotificationPermissions } from './src/services/notificationService';

export default function App() {
  useEffect(() => {
    getDB().catch(err => console.error('DB init failed:', err));
    requestNotificationPermissions().catch(console.error);
  }, []);

  return <AppNavigator />;
}
