import { useWindowDimensions } from 'react-native';

const TABLET_BREAKPOINT = 768;

export interface Breakpoint {
  isTablet: boolean;
  isPhone: boolean;
  width: number;
  height: number;
  columns: number; // 2 on phone, 3 on tablet
}

export function useBreakpoint(): Breakpoint {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;

  return {
    isTablet,
    isPhone: !isTablet,
    width,
    height,
    columns: isTablet ? 3 : 2,
  };
}
