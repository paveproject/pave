import { Assets } from '../../constants/Assets';
import { useTheme } from '../../providers/ThemeProvider';
import { upperFirst } from 'lodash';
import { useTranslations } from 'use-intl';

export interface OnboardingData {
  id: number;
  image: string;
  text: string;
  textColor: string;
  backgroundColor: string;
}

const useOnboardingData = (): OnboardingData[] => {
  const t = useTranslations();
  const { colors } = useTheme();
  return [
    {
      id: 1,
      image: Assets.onboarding.tracking,
      text: upperFirst(t('pages.onboarding.tracking.description')),
      textColor: colors.foreground,
      backgroundColor: colors.background,
    },
  ];
};

export default useOnboardingData;
