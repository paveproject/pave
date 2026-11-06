import { useCallback } from 'react';
import { Platform } from 'react-native';
import { Host, Icon, Row, FieldGroup, Spacer, Text as NativeText } from '@expo/ui';
import { Slider } from '../../components/ui/slider';
import {
  background,
  listRowBackground,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import {
  CLOUD_SYNC_INTERVAL_BOUNDS,
  GPS_INTERVAL_BOUNDS,
  useProtestSettingsStore,
} from '../../stores/useProtestSettingsStore';
import { View } from '../../components/ui/view';
import { Switch } from '../../components/ui/switch';
import { Icons } from '../../constants/icons';

/** Device-behaviour knobs only - nothing here reaches the server, which is
 * why they live in a local store rather than in `/me` (see the store). */
const SettingsProtestMode = () => {
  const t = useTranslations();
  const { colors, theme, mode } = useTheme();
  const {
    gpsEnabled,
    gpsIntervalSeconds,
    cloudSyncIntervalSeconds,
    setGpsEnabled,
    setGpsIntervalSeconds,
    setCloudSyncIntervalSeconds,
  } = useProtestSettingsStore();

  const duration = useCallback(
    (seconds: number) =>
      seconds < 60
        ? t('messages.seconds_count', { count: seconds })
        : t('messages.minutes_count', { count: Math.round(seconds / 60) }),
    [t],
  );

  const rowModifiers = Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined;

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
            <Row spacing={theme.spaces.md} alignment="center" modifiers={rowModifiers}>
              <Icon name={Icons.locate} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('pages.settings.protest_mode.gps_recording')}
              </NativeText>
              <Spacer flexible />
              <Switch value={gpsEnabled} onValueChange={setGpsEnabled} />
            </Row>
            <FieldGroup.SectionFooter>
              <NativeText textStyle={{ color: colors.mutedForeground }}>
                {t('pages.settings.protest_mode.gps_recording_description')}
              </NativeText>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          <FieldGroup.Section>
            <Row spacing={theme.spaces.md} alignment="center" modifiers={rowModifiers}>
              <Icon name={Icons.clock} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('pages.settings.protest_mode.gps_interval')}
              </NativeText>
              <Spacer flexible />
              <NativeText textStyle={{ color: colors.mutedForeground }}>
                {duration(gpsIntervalSeconds)}
              </NativeText>
            </Row>
            <Row modifiers={rowModifiers}>
              <Slider
                value={gpsIntervalSeconds}
                min={GPS_INTERVAL_BOUNDS.min}
                max={GPS_INTERVAL_BOUNDS.max}
                step={GPS_INTERVAL_BOUNDS.step}
                onValueChange={(value) => setGpsIntervalSeconds(Math.round(value))}
              />
            </Row>
            <FieldGroup.SectionFooter>
              <NativeText textStyle={{ color: colors.mutedForeground }}>
                {t('pages.settings.protest_mode.gps_interval_description')}
              </NativeText>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          <FieldGroup.Section>
            <Row spacing={theme.spaces.md} alignment="center" modifiers={rowModifiers}>
              <Icon name={Icons.download} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('pages.settings.protest_mode.sync_interval')}
              </NativeText>
              <Spacer flexible />
              <NativeText textStyle={{ color: colors.mutedForeground }}>
                {duration(cloudSyncIntervalSeconds)}
              </NativeText>
            </Row>
            <Row modifiers={rowModifiers}>
              <Slider
                value={cloudSyncIntervalSeconds}
                min={CLOUD_SYNC_INTERVAL_BOUNDS.min}
                max={CLOUD_SYNC_INTERVAL_BOUNDS.max}
                step={CLOUD_SYNC_INTERVAL_BOUNDS.step}
                onValueChange={(value) => setCloudSyncIntervalSeconds(Math.round(value))}
              />
            </Row>
            <FieldGroup.SectionFooter>
              <NativeText textStyle={{ color: colors.mutedForeground }}>
                {t('pages.settings.protest_mode.sync_interval_description')}
              </NativeText>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </View>
  );
};

export default SettingsProtestMode;
