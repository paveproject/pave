import { forwardRef } from 'react';
import { View } from './view';
import { StyleProp, ViewStyle } from 'react-native';
import { GAP } from '../../theme/globals';

export interface GridViewProps<T> extends React.ComponentProps<typeof View> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  columns?: number;
  columnStyle?: StyleProp<ViewStyle>;
  gap?: number;
}

// Fonction interne qui gère les génériques
function GridViewInner<T>(
  { data, renderItem, columns = 2, columnStyle, gap = GAP, style, ...props }: GridViewProps<T>,
  ref: React.Ref<React.ComponentRef<typeof View>>,
) {
  return (
    <View ref={ref} style={[{ flexDirection: 'row', flexWrap: 'wrap' }, style]} {...props}>
      {data.map((item, index) => (
        <View
          key={index}
          style={[
            {
              flexBasis: `${100 / columns}%`,
              flexGrow: 0,
              flexShrink: 0,
            },
            columnStyle,
          ]}
        >
          {renderItem(item, index)}
        </View>
      ))}
    </View>
  );
}

// Export avec forwardRef et cast de type pour les génériques
const GridViewWithRef = forwardRef(GridViewInner);

export const GridView = GridViewWithRef as (<T>(
  props: GridViewProps<T> & {
    ref?: React.Ref<React.ComponentRef<typeof View>>;
  },
) => React.JSX.Element) & {
  displayName?: string;
};

GridView.displayName = 'GridView';
