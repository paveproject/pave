import { NativeStackNavigationOptions } from 'expo-router';
import { SearchBarProps } from 'react-native-screens';

export type UseHeaderSearchBarProps = Omit<SearchBarProps, 'placeholder' | 'onChangeText'> & {
  placeholder: string;
  onChangeText: (e: string) => void;
};

export const useHeaderSearchBar = ({
  placeholder,
  onChangeText,
  ...props
}: UseHeaderSearchBarProps): NativeStackNavigationOptions => {
  return {
    headerSearchBarOptions: {
      ...props,
      placeholder,
      onChangeText: (e) => onChangeText(e.nativeEvent.text),
    },
  };
};
