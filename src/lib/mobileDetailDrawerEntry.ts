export const shouldShowMobileDetailDrawerButton = (
  isMobileInspectorOpen: boolean,
) => !isMobileInspectorOpen;

export const getMobileDetailDrawerButtonBottom = (
  filmstripHeight: number,
  gap = 14,
) => Math.max(0, Math.round(filmstripHeight + gap));
