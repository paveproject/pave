import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../../components/ui/Button';
import { Text } from '../../../components/ui/text';
import tw from '../../../lib/tw';
import { Stack, useRouter } from 'expo-router';

const NotFoundScreen = () => {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <SafeAreaView
        edges={['bottom']}
        style={[tw.style('flex-1 justify-center items-center gap-2')]}
      >
        <Text style={tw.style('text-3xl font-bold')}>This screen doesn&apos;t exist.</Text>
        <Button onPress={() => router.back()}>Go back!</Button>
      </SafeAreaView>
    </>
  );
};

export default NotFoundScreen;
