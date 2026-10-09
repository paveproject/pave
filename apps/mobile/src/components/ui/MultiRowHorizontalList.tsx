import React, { useMemo } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { LegendList, LegendListProps } from '@legendapp/list/react-native';

interface MultiRowHorizontalListProps<T>
  extends Omit<LegendListProps<T[]>, 'data' | 'renderItem' | 'keyExtractor' | 'children'> {
  data: T[];
  numRows?: number;
  renderItem: (item: T, index: number) => React.ReactElement;
  keyExtractor: (item: T, index: number) => string;
  columnStyle?: StyleProp<ViewStyle>;
}

export function MultiRowHorizontalList<T>({
  data,
  numRows = 2,
  renderItem,
  keyExtractor,
  columnStyle,
  ...props
}: MultiRowHorizontalListProps<T>) {
  const columns = useMemo(() => {
    const result: T[][] = [];
    for (let i = 0; i < data.length; i += numRows) {
      result.push(data.slice(i, i + numRows));
    }
    return result;
  }, [data, numRows]);

  return (
    <LegendList
      data={columns}
      keyExtractor={(column, index) => `column_${index}`}
      horizontal
      showsHorizontalScrollIndicator={false}
      renderItem={({ item: column, index: columnIndex }) => (
        <View style={[{ flexDirection: 'column' }, columnStyle]}>
          {column.map((item, itemIndex) => (
            <React.Fragment key={keyExtractor(item, itemIndex)}>
              {renderItem(item, columnIndex * numRows + itemIndex)}
            </React.Fragment>
          ))}
        </View>
      )}
      {...props}
    />
  );
}
