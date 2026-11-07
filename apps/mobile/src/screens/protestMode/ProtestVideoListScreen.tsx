import { useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import Empty from '../../components/ui/empty';
import { Icons } from '../../constants/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Empty until filming lands, so the session menu has a destination rather
 * than a row that does nothing. */
const ProtestVideoListScreen = () => {
  const t = useTranslations();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spaces.sm,
        paddingTop: theme.spaces.vertical,
        paddingLeft: insets.left + theme.spaces.horizontal,
        paddingRight: insets.right + theme.spaces.horizontal,
        paddingBottom: insets.bottom + theme.spaces.vertical,
      }}
    >
      <Empty icon={Icons.video} title={t('pages.protest_mode.sessions.no_video')} />
      <Text textColor="muted" style={{ textAlign: 'center' }}>
        {t('pages.protest_mode.coming_soon')}
      </Text>
    </View>
  );
};

export default ProtestVideoListScreen;
