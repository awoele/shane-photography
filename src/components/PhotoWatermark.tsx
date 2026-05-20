import { getWatermarkLines, type Photo } from '@/lib/photos';

type PhotoWatermarkProps = {
  photo: Photo;
};

const PhotoWatermark = ({ photo }: PhotoWatermarkProps) => {
  const watermark = getWatermarkLines(photo);
  const isLandscape = photo.width >= photo.height && photo.width > 0;
  const positionClass = isLandscape
    ? 'bottom-1 sm:bottom-2'
    : 'bottom-3 sm:bottom-4';

  return (
    <div
      className={`pointer-events-none absolute left-1/2 max-w-[90%] -translate-x-1/2 px-3 py-1 text-center text-stone-100/90 ${positionClass}`}
      style={{
        textShadow:
          '0 2px 16px rgba(0, 0, 0, 0.85), 0 0 2px rgba(0, 0, 0, 0.75)',
      }}
    >
      <p className="text-sm font-medium leading-5 sm:text-base">
        {watermark.camera}
      </p>
      <p className="mt-1 text-xs font-normal leading-5 text-stone-200/75 sm:text-sm">
        {watermark.exposure}
      </p>
    </div>
  );
};

export { PhotoWatermark };
