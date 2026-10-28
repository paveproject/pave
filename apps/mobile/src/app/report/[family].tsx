import { useCallback, useMemo } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslations } from 'use-intl';
import {
  REPORT_FAMILIES,
  reportTypesInFamily,
  type ReportFamily,
  type ReportTypeKey,
} from '@libs/constants';
import { reportIcon } from '../../constants/assets';
import { createReport } from '../../lib/watermelon/reports';
import { useToast } from '../../components/Toast';
import { useLocation } from '../../providers/LocationProvider';
import { pickableTypes } from '../../screens/report/pickableTypes';
import { ReportSheetGrid } from '../../screens/report/ReportSheetGrid';

const isReportFamily = (value: string | undefined): value is ReportFamily =>
  REPORT_FAMILIES.includes(value as ReportFamily);

const PickType = () => {
  const { family } = useLocalSearchParams<{ family: string }>();
  const router = useRouter();
  const t = useTranslations();
  const toast = useToast();
  const { position } = useLocation();

  const types = useMemo(
    () =>
      isReportFamily(family)
        ? reportTypesInFamily(family).filter((type) => pickableTypes.includes(type))
        : [],
    [family],
  );

  const label = useCallback(
    (type: ReportTypeKey) => {
      const key = `pages.map.report.types.${type}` as Parameters<typeof t.has>[0];
      return t.has(key) ? t(key) : type;
    },
    [t],
  );

  const handleSelect = useCallback(
    async (type: ReportTypeKey) => {
      if (!position) {
        toast.error(t('pages.map.report.no_location'));
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await createReport({
        type,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      toast.success(t('pages.map.report.created'));
      // `dismissTo`, not `dismiss`: this screen sits at index 1 of the nested
      // report stack, and `dismiss()` only "navigates to a stack lower than
      // the current screen" - it would drop the user back on the family
      // picker. `dismissTo` unwinds until the map, whatever the sheet's depth.
      router.dismissTo('/');
    },
    [position, router, toast, t],
  );

  // A hand-typed or stale deep link, e.g. /report/not_a_family.
  if (!isReportFamily(family)) return <Redirect href="/report" />;

  const familyKey = `pages.map.report.families.${family}` as Parameters<typeof t.has>[0];

  return (
    <ReportSheetGrid
      title={t.has(familyKey) ? t(familyKey) : family}
      items={types}
      icon={reportIcon}
      label={label}
      onSelect={handleSelect}
      leading="back"
    />
  );
};

export default PickType;
