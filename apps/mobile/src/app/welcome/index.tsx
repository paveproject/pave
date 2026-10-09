import { Text } from '../../components/ui/text';
import { View } from '../../components/ui/view';
import tw from '../../lib/tw';
const WelcomeCarouselScreen = () => {
  return (
    <>
      <View style={tw`flex-1`}>
        <Text>Welcome to the app</Text>
      </View>
    </>
  );
};

export default WelcomeCarouselScreen;
