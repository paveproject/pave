import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { type FC } from 'react';

export const withModalProvider = (Component: FC) => {
  const WrappedComponent = () => (
    <BottomSheetModalProvider>
      <Component />
    </BottomSheetModalProvider>
  );

  WrappedComponent.displayName = `withModalProvider(${Component.displayName || Component.name || 'Component'})`;

  return WrappedComponent;
};
