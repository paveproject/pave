import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';
import ProtestSessionDetailScreen from '../../../../screens/protestMode/ProtestSessionDetailScreen';
import { useTrustedContactDataAccess } from '../../../../hooks/dataAccess/useOwnerDataAccess';
import { View } from '../../../../components/ui/view';
import Empty from '../../../../components/ui/empty';
import { Icons } from '../../../../constants/icons';

/** One of the owner's recordings, same screen as `protest-mode/[id]`. */
const TrustedContactProtestSessionScreen = () => {
  const { id, sessionId } = useLocalSearchParams<{ id: string; sessionId: string }>();
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

  return <ProtestSessionDetailScreen sessionId={sessionId} source={source} />;
};

export default TrustedContactProtestSessionScreen;
