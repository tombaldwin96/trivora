import { Stack } from 'expo-router';

export default function ModesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
        headerTransparent: true,
        headerStyle: { backgroundColor: 'transparent' },
        headerTintColor: '#fff',
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Modes', headerShown: false }} />
      <Stack.Screen name="quick-fire" options={{ title: 'Quick Fire 10', headerShown: false }} />
      <Stack.Screen name="history-10" options={{ title: 'History 10', headerBackTitle: 'Modes' }} />
      <Stack.Screen name="geography-10" options={{ title: 'Geography 10', headerBackTitle: 'Modes' }} />
      <Stack.Screen name="capital-cities-10" options={{ title: 'Capital Cities 10', headerBackTitle: 'Modes' }} />
      <Stack.Screen name="science-10" options={{ title: 'Science 10', headerBackTitle: 'Modes' }} />
      <Stack.Screen name="language-10" options={{ title: 'Language 10', headerBackTitle: 'Modes' }} />
      <Stack.Screen name="unlimited" options={{ title: 'Unlimited Quiz', headerBackTitle: 'Modes' }} />
      <Stack.Screen name="1v1" options={{ title: '1v1', headerBackTitle: 'Modes' }} />
      <Stack.Screen name="tournaments" options={{ title: 'Tournaments', headerBackTitle: 'Modes' }} />
    </Stack>
  );
}
