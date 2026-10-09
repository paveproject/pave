import React from 'react';
import TrueSheet from '../../ui/TrueSheet';
import { BottomSheetProps } from '../BottomSheetManager';

interface BottomSheetDefaultViewProps extends BottomSheetProps {
  children: React.ReactNode;
}

const BottomSheetDefaultView = React.forwardRef<
  React.ComponentRef<typeof TrueSheet>,
  BottomSheetDefaultViewProps
>(({ id, children, ...props }, ref) => {
  return (
    <TrueSheet ref={ref} {...props}>
      {children}
    </TrueSheet>
  );
});
BottomSheetDefaultView.displayName = 'BottomSheetDefaultView';

export default BottomSheetDefaultView;
