import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Host, Button } from '@expo/ui';
import { useTranslations } from 'use-intl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReportType } from '@libs/api-js';
import { createReport } from '../../lib/watermelon/reports';
import { useToast } from '../../components/Toast';
import { useTheme } from '../../providers/ThemeProvider';
import { useLocation } from '../../providers/LocationProvider';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';

const REPORT_TYPES: ReportType[] = [
  'tear_gas',
  'police_presence',
  'arrest',
  'violence',
  'road_block',
  'medical',
  'water_cannon',
  'kettling',
  'other',
];

/**
 * `createReport` never throws (see `lib/watermelon/reports.ts`) - the
 * report is already durably saved locally the instant this resolves,
 * regardless of whether the push to the API behind it succeeded or will
 * have to be retried on reconnect. So this screen only has one real failure
 * case to handle: no location yet.
 */
const ReportSheet = () => {
  const router = useRouter();
  const t = useTranslations();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const toast = useToast();
  const { position } = useLocation();

  const handleSelect = useCallback(
    async (type: ReportType) => {
      if (!position) {
        toast.error(t('pages.map.report.no_location'));
        return;
      }

      await createReport({
        type,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      toast.success(t('pages.map.report.created'));
      router.back();
    },
    [position, router, toast, t],
  );

  return (
    <View
      style={{
        padding: theme.spaces.horizontal,
        paddingBottom: insets.bottom + theme.spaces.vertical,
        gap: theme.spaces.md,
      }}
    >
      <Text variant="title">{t('pages.map.report.title')}</Text>
      <View style={{ gap: theme.spaces.sm }}>
        {REPORT_TYPES.map((type) => (
          <Host key={type} style={{ width: '100%' }} matchContents={{ vertical: true }}>
            <Button
              variant="outlined"
              label={t(`pages.map.report.types.${type}`)}
              onPress={() => handleSelect(type)}
            />
          </Host>
        ))}
      </View>
    </View>
  );
};

export default ReportSheet;
