import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';
import ProtestSessionsScreen from '../../../screens/protestMode/ProtestSessionsScreen';
import { useTrustedContactDataAccess } from '../../../hooks/dataAccess/useOwnerDataAccess';
import { View } from '../../../components/ui/view';
import Empty from '../../../components/ui/empty';
import { Icons } from '../../../constants/icons';

/** The same screen the user sees for their own recordings, only the source
 * differs. Guarded because the route is reachable by deep link. */
const TrustedContactProtestSessionsScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const { source, isLoading } = useTrustedContactDataAccess(id);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!source) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Empty icon={Icons.lock} title={t('pages.settings.trusted_contact.access.not_open')} />
      </View>
    );
  }

  return <ProtestSessionsScreen source={source} />;
};

export default TrustedContactProtestSessionsScreen;
