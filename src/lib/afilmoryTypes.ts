export type AfilmoryManifestVersion = `v${number}`;

export type AfilmoryToneType =
  | 'low-key'
  | 'high-key'
  | 'normal'
  | 'high-contrast';

export type AfilmoryLocationInfo = {
  latitude?: number;
  longitude?: number;
  country?: string;
  city?: string;
  locationName?: string;
};

export type AfilmoryToneAnalysis = {
  toneType: AfilmoryToneType;
  brightness: number;
  contrast: number;
  shadowRatio: number;
  highlightRatio: number;
};

export type AfilmoryFujiRecipe = {
  FilmMode?: string;
  GrainEffectRoughness?: string;
  GrainEffectSize?: string;
  ColorChromeEffect?: string;
  ColorChromeFxBlue?: string;
  WhiteBalance?: string;
  WhiteBalanceFineTune?: string;
  DynamicRange?: string;
  HighlightTone?: string;
  ShadowTone?: string;
  Saturation?: string;
  Sharpness?: string;
  NoiseReduction?: string;
  Clarity?: number;
  ColorTemperature?: string | number;
  DevelopmentDynamicRange?: number;
  DynamicRangeSetting?: string;
};

export type AfilmoryPickedExif = {
  zone?: string;
  tz?: string;
  tzSource?: string;
  Orientation?: number;
  Make?: string;
  Model?: string;
  Software?: string;
  Artist?: string;
  Copyright?: string;
  ExposureTime?: string | number;
  FNumber?: number;
  ExposureProgram?: string;
  ISO?: number;
  ShutterSpeedValue?: string | number;
  ApertureValue?: number;
  BrightnessValue?: number;
  ExposureCompensation?: number;
  MaxApertureValue?: number;
  OffsetTime?: string;
  OffsetTimeOriginal?: string;
  OffsetTimeDigitized?: string;
  LightSource?: string;
  Flash?: string;
  FocalLength?: string;
  FocalLengthIn35mmFormat?: string;
  LensMake?: string;
  LensModel?: string;
  ColorSpace?: string;
  ExposureMode?: string;
  SceneCaptureType?: string;
  Aperture?: number;
  ScaleFactor35efl?: number;
  ShutterSpeed?: string | number;
  LightValue?: number;
  DateTimeOriginal?: string;
  DateTimeDigitized?: string;
  ImageWidth?: number;
  ImageHeight?: number;
  MeteringMode?: string;
  WhiteBalance?: string;
  WBShiftAB?: string | number;
  WBShiftGM?: string | number;
  WhiteBalanceBias?: string | number;
  FlashMeteringMode?: string;
  SensingMethod?: string;
  FocalPlaneXResolution?: string | number;
  FocalPlaneYResolution?: string | number;
  GPSAltitude?: string | number;
  GPSLatitude?: string | number;
  GPSLongitude?: string | number;
  GPSAltitudeRef?: string | number;
  GPSLatitudeRef?: string;
  GPSLongitudeRef?: string;
  FujiRecipe?: AfilmoryFujiRecipe;
  MPImageType?: string;
  UniformResourceName?: string;
  Rating?: number;
  MotionPhoto?: string | number | boolean;
  MotionPhotoVersion?: string | number;
  MotionPhotoPresentationTimestampUs?: string | number;
  ContainerDirectory?: unknown;
  MicroVideo?: string | number | boolean;
  MicroVideoVersion?: string | number;
  MicroVideoOffset?: string | number;
  MicroVideoPresentationTimestampUs?: string | number;
};

export type AfilmoryVideoSource =
  | { type: 'live-photo'; videoUrl: string; s3Key: string }
  | {
      type: 'motion-photo';
      offset: number;
      size?: number;
      presentationTimestamp?: number;
    };

export type AfilmoryPhotoManifestItem = {
  id: string;
  title: string;
  dateTaken: string;
  tags: string[];
  originalCategory?: string;
  description: string;
  originalUrl: string;
  format: string;
  thumbnailUrl: string;
  ogImageUrl?: string | null;
  thumbHash: string | null;
  width: number;
  height: number;
  aspectRatio: number;
  s3Key: string;
  lastModified: string;
  size: number;
  sortOrder?: number;
  digest?: string;
  exif: AfilmoryPickedExif | null;
  toneAnalysis: AfilmoryToneAnalysis | null;
  location: AfilmoryLocationInfo | null;
  isHDR?: boolean;
  video?: AfilmoryVideoSource;
};

export type AfilmoryCameraInfo = {
  make: string;
  model: string;
  displayName: string;
};

export type AfilmoryLensInfo = {
  make?: string;
  model: string;
  displayName: string;
};

export type AfilmoryManifest = {
  version: AfilmoryManifestVersion;
  data: AfilmoryPhotoManifestItem[];
  cameras: AfilmoryCameraInfo[];
  lenses: AfilmoryLensInfo[];
};
