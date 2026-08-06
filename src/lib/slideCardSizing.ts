import type { CSSProperties } from 'react';

type SlidePhotoDimensions = {
  height: number;
  width: number;
};

export type SlideCardAspectStyle = CSSProperties & {
  '--slide-card-width-active-default': string;
  '--slide-card-width-active-desktop-portrait': string;
  '--slide-card-width-active-landscape': string;
  '--slide-card-width-active-mobile-portrait': string;
  '--slide-card-width-default': string;
  '--slide-card-width-desktop-portrait': string;
  '--slide-card-width-landscape': string;
  '--slide-card-width-mobile-portrait': string;
};

export type SlideFlipCardAspectStyle = CSSProperties & {
  '--slide-flip-aspect-default': string;
  '--slide-flip-aspect-mobile-portrait': string;
  '--slide-flip-card-height-default': string;
  '--slide-flip-card-height-desktop-portrait': string;
  '--slide-flip-card-height-landscape': string;
  '--slide-flip-card-height-mobile-portrait': string;
  '--slide-flip-card-width-default': string;
  '--slide-flip-card-width-desktop-portrait': string;
  '--slide-flip-card-width-landscape': string;
  '--slide-flip-card-width-mobile-portrait': string;
};

const FALLBACK_SLIDE_ASPECT_RATIO = 3 / 2;

const formatSize = (value: number) => value.toFixed(2);

export const getSafeSlideAspectRatio = ({
  height,
  width,
}: SlidePhotoDimensions) => {
  if (width > 0 && height > 0) {
    return width / height;
  }

  return FALLBACK_SLIDE_ASPECT_RATIO;
};

export const getSlideCardAspectStyle = (
  photo: SlidePhotoDimensions,
): SlideCardAspectStyle => {
  const aspectRatio = getSafeSlideAspectRatio(photo);

  return {
    '--slide-card-width-active-default': `clamp(${formatSize(
      295 * aspectRatio,
    )}px, ${formatSize(67 * aspectRatio)}vh, ${formatSize(
      610 * aspectRatio,
    )}px)`,
    '--slide-card-width-active-desktop-portrait': `min(${formatSize(
      65 * aspectRatio,
    )}vh, ${formatSize(790 * aspectRatio)}px)`,
    '--slide-card-width-active-landscape': `min(${formatSize(
      84 * aspectRatio,
    )}svh, ${formatSize(430 * aspectRatio)}px)`,
    '--slide-card-width-active-mobile-portrait': `min(${formatSize(
      124 * aspectRatio,
    )}vw, ${formatSize(480 * aspectRatio)}px)`,
    '--slide-card-width-default': `clamp(${formatSize(
      250 * aspectRatio,
    )}px, ${formatSize(57 * aspectRatio)}vh, ${formatSize(
      520 * aspectRatio,
    )}px)`,
    '--slide-card-width-desktop-portrait': `min(${formatSize(
      56 * aspectRatio,
    )}vh, ${formatSize(680 * aspectRatio)}px)`,
    '--slide-card-width-landscape': `min(${formatSize(
      72 * aspectRatio,
    )}svh, ${formatSize(360 * aspectRatio)}px)`,
    '--slide-card-width-mobile-portrait': `min(${formatSize(
      108 * aspectRatio,
    )}vw, ${formatSize(420 * aspectRatio)}px)`,
    aspectRatio: `${aspectRatio}`,
    width: 'var(--slide-card-width-default)',
  };
};

export const getSlideFlipCardAspectStyle = (
  photo: SlidePhotoDimensions,
): SlideFlipCardAspectStyle => {
  const aspectRatio = getSafeSlideAspectRatio(photo);
  const mobilePortraitAspect =
    aspectRatio > 1.05 ? 1 / aspectRatio : aspectRatio;

  return {
    '--slide-flip-aspect-default': `${aspectRatio}`,
    '--slide-flip-aspect-mobile-portrait': `${mobilePortraitAspect}`,
    '--slide-flip-card-height-default': 'clamp(320px, 72vh, 720px)',
    '--slide-flip-card-height-desktop-portrait': 'min(68vh, 820px)',
    '--slide-flip-card-height-landscape': 'min(92svh, 520px)',
    '--slide-flip-card-height-mobile-portrait': `min(${formatSize(
      92 / mobilePortraitAspect,
    )}vw, 560px, 82svh)`,
    '--slide-flip-card-width-default': `clamp(${formatSize(
      320 * aspectRatio,
    )}px, ${formatSize(72 * aspectRatio)}vh, ${formatSize(
      720 * aspectRatio,
    )}px)`,
    '--slide-flip-card-width-desktop-portrait': `min(${formatSize(
      68 * aspectRatio,
    )}vh, ${formatSize(820 * aspectRatio)}px)`,
    '--slide-flip-card-width-landscape': `min(${formatSize(
      92 * aspectRatio,
    )}svh, ${formatSize(520 * aspectRatio)}px)`,
    '--slide-flip-card-width-mobile-portrait': `min(${formatSize(
      92,
    )}vw, ${formatSize(560 * mobilePortraitAspect)}px, ${formatSize(
      82 * mobilePortraitAspect,
    )}svh)`,
    aspectRatio: `${aspectRatio}`,
    width: 'var(--slide-flip-card-width-default)',
  };
};
