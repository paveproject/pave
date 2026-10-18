import { Platform } from 'react-native';
import { Host, Icon, Row, Slider, Spacer, Switch, FieldGroup, Text as NativeText } from '@expo/ui';
import {
  background,
  listRowBackground,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useTranslations } from 'use-intl';
import { useProtestSettingsStore } from '../../stores/useProtestSettingsStore';
import { View } from '../../components/ui/view';
import { useTheme } from '../../providers/ThemeProvider';
import { Icons } from '../../constants/icons';

const GPS_POLLING_MIN_SECONDS = 10;
const GPS_POLLING_MAX_SECONDS = 180;
const GPS_SAVE_MIN_SECONDS = 60;
const GPS_SAVE_MAX_SECONDS = 900;

/** "30s", "5 min" - `useDurationLabel` rounds under a minute to "0 minutes", wrong for this range. */
const formatFrequency = (
  t: (key: string, values?: Record<string, number>) => string,
  seconds: number,
) =>
  seconds < 60
    ? t('messages.seconds_count', { count: seconds })
    : t('messages.minutes_count', { count: Math.round(seconds / 60) });

const SettingsProtestMode = () => {
  const t = useTranslations();
  const { theme, colors, mode } = useTheme();

  const gpsRecordingEnabled = useProtestSettingsStore((s) => s.gpsRecordingEnabled);
  const setGpsRecordingEnabled = useProtestSettingsStore((s) => s.setGpsRecordingEnabled);
  const gpsPollingIntervalSeconds = useProtestSettingsStore((s) => s.gpsPollingIntervalSeconds);
  const setGpsPollingIntervalSeconds = useProtestSettingsStore(
    (s) => s.setGpsPollingIntervalSeconds,
  );
  const gpsSaveIntervalSeconds = useProtestSettingsStore((s) => s.gpsSaveIntervalSeconds);
  const setGpsSaveIntervalSeconds = useProtestSettingsStore((s) => s.setGpsSaveIntervalSeconds);

  const rowBackground = Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Host style={{ flex: 1, width: '100%' }} seedColor={colors.foreground} colorScheme={mode}>
        <FieldGroup
          style={{ backgroundColor: colors.background }}
          modifiers={
            Platform.OS === 'ios'
              ? [
                  scrollContentBackground('hidden'),
                  background(colors.background),
                  tint(colors.foreground),
                ]
              : undefined
          }
        >
          <FieldGroup.Section>
            <Row alignment="center" spacing={theme.spaces.md} modifiers={rowBackground}>
              <Icon
                name={Icons.locateFocused}
                size={theme.icons.sizes.md}
                color={colors.foreground}
              />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('pages.settings.protest_mode.gps_recording')}
              </NativeText>
              <Spacer flexible />
              <Switch value={gpsRecordingEnabled} onValueChange={setGpsRecordingEnabled} />
            </Row>
          </FieldGroup.Section>

          <FieldGroup.Section>
            <Row alignment="center" spacing={theme.spaces.md} modifiers={rowBackground}>
              <Icon name={Icons.clock} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('pages.settings.protest_mode.polling_frequency')}
              </NativeText>
              <Spacer flexible />
              <NativeText textStyle={{ color: colors.mutedForeground }}>
                {formatFrequency(t, gpsPollingIntervalSeconds)}
              </NativeText>
            </Row>
            <Row alignment="center" spacing={theme.spaces.md} modifiers={rowBackground}>
              <Slider
                value={gpsPollingIntervalSeconds}
                min={GPS_POLLING_MIN_SECONDS}
                max={GPS_POLLING_MAX_SECONDS}
                step={10}
                onValueChange={setGpsPollingIntervalSeconds}
              />
            </Row>
            <FieldGroup.SectionFooter>
              <NativeText textStyle={{ color: colors.mutedForeground, textAlign: 'center' }}>
                {t('pages.settings.protest_mode.polling_frequency_description')}
              </NativeText>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          <FieldGroup.Section>
            <Row alignment="center" spacing={theme.spaces.md} modifiers={rowBackground}>
              <Icon name={Icons.download} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('pages.settings.protest_mode.save_frequency')}
              </NativeText>
              <Spacer flexible />
              <NativeText textStyle={{ color: colors.mutedForeground }}>
                {formatFrequency(t, gpsSaveIntervalSeconds)}
              </NativeText>
            </Row>
            <Row alignment="center" spacing={theme.spaces.md} modifiers={rowBackground}>
              <Slider
                value={gpsSaveIntervalSeconds}
                min={GPS_SAVE_MIN_SECONDS}
                max={GPS_SAVE_MAX_SECONDS}
                step={30}
                onValueChange={setGpsSaveIntervalSeconds}
              />
            </Row>
            <FieldGroup.SectionFooter>
              <NativeText textStyle={{ color: colors.mutedForeground, textAlign: 'center' }}>
                {t('pages.settings.protest_mode.save_frequency_description')}
              </NativeText>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </View>
  );
};

export default SettingsProtestMode;
