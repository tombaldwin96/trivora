import { useWindowDimensions } from 'react-native';

/** Max width for main content on tablet so it doesn't stretch awkwardly. */
export const CONTENT_MAX_WIDTH = 520;

/** Breakpoint above which we treat as tablet for layout (e.g. center content). */
export const TABLET_BREAKPOINT = 600;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  const contentWidth = isTablet ? Math.min(width, CONTENT_MAX_WIDTH) : width;
  return { width, height, isTablet, contentWidth };
}

/** Use for ScrollView contentContainerStyle to center and limit width on tablet. */
export function useContentContainerStyle() {
  const { width, isTablet } = useResponsive();
  return {
    maxWidth: isTablet ? CONTENT_MAX_WIDTH : undefined,
    width: width,
    alignSelf: 'center' as const,
  };
}
