import { useEffect } from 'react';
import { useNavigation } from 'expo-router';
import useBottomSheetStore from '../../stores/useBottomSheetStore';
import { TrueSheet } from '@lodev09/react-native-true-sheet';

export interface BottomSheetProps
  extends Omit<React.ComponentPropsWithoutRef<typeof TrueSheet>, 'children'> {
  id: string;
}

export const BottomSheetManager = () => {
  const navigation = useNavigation();
  const sheets = useBottomSheetStore((state) => state.sheets);
  const closeSheet = useBottomSheetStore((state) => state.closeSheet);
  const removeSheet = useBottomSheetStore((state) => state.removeSheet);

  useEffect(() => {
    const unsubscribe = navigation.addListener('state', () => {
      sheets.forEach(async (sheet) => {
        if (!sheet.persistent && sheet.ref?.current) {
          await closeSheet(sheet.id);
        }
      });
    });

    return unsubscribe;
  }, [sheets, closeSheet, navigation]);

  return sheets.map(({ id, content: Content, props, detents, ref }) => (
    <Content
      key={id}
      ref={ref}
      id={id}
      detents={detents}
      initialDetentIndex={0}
      closeSheet={closeSheet}
      removeSheet={removeSheet}
      onDidDismiss={() => {
        removeSheet(id);
      }}
      {...props}
    />
  ));
};
