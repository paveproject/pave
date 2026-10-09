import { forwardRef, useCallback, useMemo, useState } from 'react';
import { KeyboardToolbar } from '../ui/KeyboardToolbar';
import { KeyboardToolbarProps } from 'react-native-keyboard-controller';
import {
  EnrichedMarkdownTextInputInstance,
  EnrichedMarkdownTextInputProps,
  OnLinkDetected,
  StyleState,
} from 'react-native-enriched-markdown';
import { LucideIcon } from 'lucide-react-native';
import { Icons } from '../../constants/Icons';
import { useTheme } from '../../providers/ThemeProvider';
import { FlashList } from '@shopify/flash-list';
import tw from '../../lib/tw';
import { BORDER_RADIUS_FULL, GAP, GAP_XS } from '../../theme/globals';
import { View } from 'react-native';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { upperFirst } from 'lodash';
import { useTranslations } from 'use-intl';

type Item = {
  title: string;
  onPress?: () => void;
  icon: LucideIcon;
  active: boolean;
  disabled?: boolean;
};

interface ToolbarProps extends KeyboardToolbarProps {
  editorRef: React.RefObject<EnrichedMarkdownTextInputInstance | null>;
  stylesState?: StyleState | null;
  selectionState?:
    | Parameters<NonNullable<EnrichedMarkdownTextInputProps['onChangeSelection']>>[0]
    | null;
  linkState?: OnLinkDetected | null;
}

export const Toolbar = forwardRef<React.ComponentRef<typeof KeyboardToolbar>, ToolbarProps>(
  ({ editorRef, stylesState, selectionState, linkState, ...props }, ref) => {
    const t = useTranslations();
    const { colors } = useTheme();
    const [isLinkMode, setIsLinkMode] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');

    const items = useMemo<Item[]>(
      () => [
        {
          title: 'Toggle bold',
          onPress: editorRef.current?.toggleBold,
          icon: Icons.Bold,
          active: stylesState?.bold.isActive === true,
        },
        {
          title: 'Toggle underline',
          onPress: editorRef.current?.toggleUnderline,
          icon: Icons.Underline,
          active: stylesState?.underline.isActive === true,
        },
        {
          title: 'Toggle italic',
          onPress: editorRef.current?.toggleItalic,
          icon: Icons.Italic,
          active: stylesState?.italic.isActive === true,
        },
        {
          title: 'Toggle strikethrough',
          onPress: editorRef.current?.toggleStrikethrough,
          icon: Icons.Strikethrough,
          active: stylesState?.strikethrough.isActive === true,
        },
        {
          title: 'Insert link',
          onPress: () => {
            if (stylesState?.link.isActive && linkState) {
              setLinkUrl(linkState.url);
            }
            setIsLinkMode((prev) => !prev);
          },
          icon: Icons.Link,
          active: stylesState?.link.isActive === true,
          disabled: selectionState ? selectionState.start === selectionState.end : true,
        },
      ],
      [editorRef, stylesState, selectionState, linkState],
    );

    // Handlers
    const handleCancel = useCallback(() => {
      setIsLinkMode(false);
      setLinkUrl('');
    }, []);
    const handleInsertLink = useCallback(() => {
      if (!editorRef.current) return;
      const cleanedLink = linkUrl.trim();
      if (cleanedLink.length === 0) return;
      editorRef.current.setLink(cleanedLink);
      handleCancel();
    }, [linkUrl, editorRef, handleCancel]);

    return (
      <KeyboardToolbar {...props}>
        {!isLinkMode && <KeyboardToolbar.Done />}
        <KeyboardToolbar.Content>
          {isLinkMode ? (
            <View style={{ paddingHorizontal: GAP_XS }}>
              <Input
                autoFocus
                placeholder="https://example.com"
                value={linkUrl}
                onChangeText={setLinkUrl}
                icon={Icons.Link}
                autoCapitalize="none"
                inputContainerStyle={{ borderRadius: BORDER_RADIUS_FULL }}
                rightComponent={
                  <View style={[tw`flex-row items-center`, { gap: GAP }]}>
                    <Button
                      variant="ghost"
                      size="fit"
                      onPress={handleCancel}
                      textStyle={{ color: colors.mutedForeground }}
                    >
                      {upperFirst(t('common.messages.cancel'))}
                    </Button>
                    <Button
                      variant="ghost"
                      size="fit"
                      textStyle={{
                        color: colors.accentYellow,
                      }}
                      onPress={handleInsertLink}
                    >
                      {upperFirst(t('common.messages.insert'))}
                    </Button>
                  </View>
                }
              />
            </View>
          ) : (
            <FlashList
              data={items}
              contentContainerStyle={[{ paddingHorizontal: GAP_XS }]}
              horizontal
              renderItem={({ item }) => (
                <Button
                  icon={item.icon}
                  iconProps={{
                    color: item.active ? colors.foreground : colors.mutedForeground,
                  }}
                  disabled={item.disabled}
                  variant="ghost"
                  size="icon"
                  onPress={item.onPress}
                  style={tw`p-0`}
                  containerStyle={tw`p-0`}
                  textStyle={tw`p-0`}
                />
              )}
              keyExtractor={(item, index) => item.title + index}
              ItemSeparatorComponent={() => <View style={{ width: GAP_XS }} />}
            />
          )}
        </KeyboardToolbar.Content>
      </KeyboardToolbar>
    );
  },
);
Toolbar.displayName = 'Toolbar';
