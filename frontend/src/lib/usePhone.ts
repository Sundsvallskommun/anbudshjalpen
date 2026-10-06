import { useMediaQuery } from "@astryxdesign/core/hooks";

/**
 * The phone layout's width (below the design system's `sm`, 640 px): one-line header with the avatar, the main
 * choices as tabs on a second row, short step labels, and the source shown in a bottom sheet instead of a dialog.
 */
export const PHONE_QUERY = "(width < 640px)";

/** Whether the viewport is phone-sized; follows resizing and rotation without a reload. */
export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}
