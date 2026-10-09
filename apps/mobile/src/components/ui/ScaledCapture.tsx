import { useState, forwardRef } from 'react';
import { View } from 'react-native';
import ViewShot from 'react-native-view-shot';

interface ScaledCaptureProps extends Omit<React.ComponentPropsWithoutRef<typeof View>, 'children'> {
  targetWidth: number;
  renderContent: (scale: number) => React.ReactNode;
}

export const ScaledCapture = forwardRef<React.ComponentRef<typeof ViewShot>, ScaledCaptureProps>(
  ({ targetWidth, renderContent, ...props }, ref) => {
    const [previewWidth, setPreviewWidth] = useState(0);

    const scaleFactor = previewWidth > 0 ? targetWidth / previewWidth : 1;

    return (
      <View onLayout={(e) => setPreviewWidth(e.nativeEvent.layout.width)} {...props}>
        {renderContent(1)}

        {previewWidth > 0 && (
          <ViewShot
            ref={ref}
            options={{ format: 'png', quality: 1, result: 'data-uri' }}
            style={{
              position: 'absolute',
              top: -9999,
              left: -9999,
              width: targetWidth,
            }}
          >
            {renderContent(scaleFactor)}
          </ViewShot>
        )}
      </View>
    );
  },
);
ScaledCapture.displayName = 'ScaledCapture';
