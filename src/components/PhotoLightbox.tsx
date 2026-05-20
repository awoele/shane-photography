/* eslint-disable @next/next/no-img-element */
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  type WheelEvent,
} from 'react';

import { PhotoInfoPanel } from '@/components/PhotoInfoPanel';
import { PhotoWatermark } from '@/components/PhotoWatermark';
import { type Photo } from '@/lib/photos';

type PhotoLightboxProps = {
  photos: Photo[];
  activeIndex: number;
  onClose: () => void;
  onSelectIndex: (index: number) => void;
};

type Point = {
  x: number;
  y: number;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

const clampZoom = (value: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

const getDistance = (first: Point, second: Point) =>
  Math.hypot(first.x - second.x, first.y - second.y);

const IconButton = ({
  label,
  children,
  onClick,
  className = '',
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className={`grid size-10 place-items-center rounded-full bg-[#17120f]/80 text-stone-200 ring-1 ring-white/10 backdrop-blur transition hover:bg-stone-800 hover:text-white ${className}`}
  >
    {children}
  </button>
);

const PhotoLightbox = ({
  photos,
  activeIndex,
  onClose,
  onSelectIndex,
}: PhotoLightboxProps) => {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const activePhoto = photos[activeIndex];
  const pointers = useRef<Map<number, Point>>(new Map());
  const pinchStartDistance = useRef(0);
  const pinchStartZoom = useRef(MIN_ZOOM);

  const goTo = (offset: number) => {
    if (photos.length === 0) {
      return;
    }

    const nextIndex = (activeIndex + offset + photos.length) % photos.length;
    setZoom(MIN_ZOOM);
    onSelectIndex(nextIndex);
  };

  const zoomIn = () => {
    setZoom((current) => clampZoom(current + ZOOM_STEP));
  };

  const zoomOut = () => {
    setZoom((current) => clampZoom(current - ZOOM_STEP));
  };

  const resetZoom = () => {
    setZoom(MIN_ZOOM);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) =>
      clampZoom(current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)),
    );
  };

  const updatePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePointer(event);

    if (pointers.current.size === 2) {
      const points = Array.from(pointers.current.values());
      const first = points[0];
      const second = points[1];

      if (first && second) {
        pinchStartDistance.current = getDistance(first, second);
        pinchStartZoom.current = zoom;
      }
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) {
      return;
    }

    updatePointer(event);

    if (pointers.current.size !== 2 || pinchStartDistance.current === 0) {
      return;
    }

    const points = Array.from(pointers.current.values());
    const first = points[0];
    const second = points[1];

    if (first && second) {
      const distance = getDistance(first, second);
      const nextZoom =
        pinchStartZoom.current * (distance / pinchStartDistance.current);
      setZoom(clampZoom(nextZoom));
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);

    if (pointers.current.size < 2) {
      pinchStartDistance.current = 0;
      pinchStartZoom.current = zoom;
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }

      if (event.key === 'ArrowLeft') {
        goTo(-1);
      }

      if (event.key === 'ArrowRight') {
        goTo(1);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  });

  useEffect(() => {
    setZoom(MIN_ZOOM);
    pointers.current.clear();
    pinchStartDistance.current = 0;
    pinchStartZoom.current = MIN_ZOOM;
  }, [activeIndex]);

  if (!activePhoto) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0f0b08]/95 p-3 text-stone-100 backdrop-blur-xl sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={activePhoto.title}
    >
      <div className="mx-auto flex size-full max-w-[1360px] overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#17120f] shadow-2xl shadow-black/40 max-lg:flex-col">
        <section className="relative flex min-h-[54vh] flex-1 items-center justify-center bg-[#11100e] lg:min-h-0">
          <div className="absolute left-4 top-4 z-10 rounded-full bg-[#17120f]/75 px-3 py-1 text-xs text-stone-400 ring-1 ring-white/10 backdrop-blur">
            {activeIndex + 1} / {photos.length}
          </div>

          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            <IconButton label="Zoom out" onClick={zoomOut}>
              <span aria-hidden="true" className="text-xl leading-none">
                -
              </span>
            </IconButton>
            <button
              type="button"
              onClick={resetZoom}
              className="hidden h-10 rounded-full bg-[#17120f]/80 px-3 text-xs text-stone-300 ring-1 ring-white/10 transition hover:bg-stone-800 hover:text-white sm:block"
            >
              {Math.round(zoom * 100)}%
            </button>
            <IconButton label="Zoom in" onClick={zoomIn}>
              <span aria-hidden="true" className="text-xl leading-none">
                +
              </span>
            </IconButton>
          </div>

          <IconButton
            label="Previous photo"
            onClick={() => goTo(-1)}
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </IconButton>

          <div
            className="flex size-full items-center justify-center overflow-hidden px-4 py-16 sm:px-12 lg:px-16"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onWheel={handleWheel}
            style={{ touchAction: 'none' }}
          >
            <div className="relative inline-flex max-h-full max-w-full items-center justify-center">
              <img
                key={activePhoto.id}
                src={activePhoto.src}
                alt={activePhoto.title}
                draggable={false}
                className="max-h-full max-w-full select-none object-contain transition-transform duration-150 ease-out"
                style={{ transform: `scale(${zoom})` }}
              />
              <PhotoWatermark photo={activePhoto} />
            </div>
          </div>

          <IconButton
            label="Next photo"
            onClick={() => goTo(1)}
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </IconButton>
        </section>

        <aside className="flex w-full shrink-0 flex-col border-t border-white/[0.08] bg-[#1d1915] max-lg:max-h-[46vh] lg:h-full lg:w-[390px] lg:border-l lg:border-t-0 xl:w-[430px]">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.07] px-5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-stone-100">Shane</p>
              <p className="mt-0.5 text-xs text-stone-500">Photo archive</p>
            </div>
            <IconButton label="Close lightbox" onClick={onClose}>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </IconButton>
          </div>

          <PhotoInfoPanel
            photo={activePhoto}
            className="min-h-0 flex-1 overflow-y-auto px-5 py-6"
            showPrivateNote
          />
        </aside>
      </div>
    </div>
  );
};

export { PhotoLightbox };
