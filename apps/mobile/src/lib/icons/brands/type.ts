import { LucideProps } from 'lucide-react-native';
import { ForwardRefExoticComponent } from 'react';

export interface BrandIconProps extends Omit<LucideProps, 'color'> {
  variant?: 'colored' | 'light' | 'dark';
}

export type BrandIcon = ForwardRefExoticComponent<BrandIconProps>;
