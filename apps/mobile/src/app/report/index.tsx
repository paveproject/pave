import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { REPORT_FAMILIES, reportTypesInFamily, type ReportFamily } from '@libs/constants';
import { reportFamilyIcon } from '../../constants/assets';
import { pickableTypes } from '../../screens/report/pickableTypes';
import { ReportSheetGrid } from '../../screens/report/ReportSheetGrid';

/**
 * A family with nothing pickable in it (every type disabled, or all of them
 * restricted to other countries) would navigate to an empty list, so it isn't
 * offered at all.
 */
const FAMILIES: ReportFamily[] = REPORT_FAMILIES.filter((family) =>
  reportTypesInFamily(family).some((type) => pickableTypes.includes(type)),
);

const PickFamily = () => {
  const router = useRouter();
  const t = useTranslations();

  const label = useCallback(
    (family: ReportFamily) => {
      const key = `pages.map.report.families.${family}` as Parameters<typeof t.has>[0];
      return t.has(key) ? t(key) : family;
    },
    [t],
  );

  return (
    <ReportSheetGrid
      title={t('pages.map.report.title')}
      items={FAMILIES}
      icon={reportFamilyIcon}
      label={label}
      onSelect={(family) => router.push(`/report/${family}`)}
      leading="close"
    />
  );
};

export default PickFamily;
