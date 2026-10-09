import { UseHeaderSearchBarProps } from './useHeaderSearchBar';
import { SearchBar } from '../components/ui/searchbar';
import { NativeStackNavigationOptions } from 'expo-router';

export const useHeaderSearchBar = ({
  placeholder,
  onChangeText,
  onFocus,
  onBlur,
  ...props
}: UseHeaderSearchBarProps): NativeStackNavigationOptions => {
  return {
    headerTitle: () => (
      <SearchBar
        placeholder={placeholder}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    ),
  };
};
