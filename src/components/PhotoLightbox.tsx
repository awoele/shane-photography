/* eslint-disable @next/next/no-img-element */
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';

import { PhotoCommentsPanel } from '@/components/PhotoCommentsPanel';
import { PhotoInfoPanel } from '@/components/PhotoInfoPanel';
import { type Photo } from '@/lib/photos';

type PhotoLightboxProps = {
  photos: Photo[];
  activeIndex: number;
  onClose: () => void;
  onSelectIndex: (index: number) => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const BUTTON_ZOOM_STEP = 0.4;
const DOUBLE_CLICK_ZOOM_STEP = 1.5;
const WHEEL_ZOOM_STEP = 0.08;
const SWIPE_DISTANCE = 58;
const SWIPE_AXIS_LOCK = 1.25;

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
    className={`bg-[#17120f]/82 grid size-10 place-items-center rounded-full text-stone-200 ring-1 ring-white/10 backdrop-blur transition hover:bg-stone-800 hover:text-white ${className}`}
  >
    {children}
  </button>
);

const CloseIcon = () => (
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
);

const ArrowIcon = ({ direction }: { direction: 'next' | 'previous' }) => (
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
    {direction === 'previous' ? (
      <path d="m15 18-6-6 6-6" />
    ) : (
      <path d="m9 18 6-6-6-6" />
    )}
  </svg>
);

const PhotoLightbox = ({
  photos,
  activeIndex,
  onClose,
  onSelectIndex,
}: PhotoLightboxProps) => {
  const [isZoomed, setIsZoomed] = useState(false);
  const activePhoto = photos[activeIndex];
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const goTo = useCallback(
    (offset: number) => {
      if (photos.length === 0) {
        return;
      }

      const nextIndex = (activeIndex + offset + photos.length) % photos.length;
      setIsZoomed(false);
      onSelectIndex(nextIndex);
    },
    [activeIndex, onSelectIndex, photos.length],
  );

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
  }, [goTo, onClose]);

  useEffect(() => {
    setIsZoomed(false);
    swipeStart.current = null;
  }, [activeIndex]);

  if (!activePhoto) {
    return null;
  }

  return (
    <div
      className="bg-[#090706]/88 fixed inset-0 z-50 overflow-y-auto text-stone-100 backdrop-blur-md lg:flex lg:items-center lg:justify-center lg:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={activePhoto.title}
    >
      <div className="relative min-h-svh w-full bg-[#18130f] shadow-2xl shadow-black/50 lg:flex lg:h-[92vh] lg:min-h-0 lg:w-[94vw] lg:max-w-[1480px] lg:overflow-hidden lg:rounded-[22px] lg:border lg:border-white/[0.09]">
        <IconButton
          label="Close lightbox"
          onClick={onClose}
          className="fixed right-3 top-3 z-30 lg:absolute lg:right-4 lg:top-4"
        >
          <CloseIcon />
        </IconButton>

        <section
          className="relative w-screen bg-[#11100e] lg:h-full lg:min-h-0 lg:w-auto lg:flex-1"
          onTouchStart={(event) => {
            if (isZoomed || event.touches.length !== 1) {
              swipeStart.current = null;
              return;
            }

            const touch = event.touches.item(0);
            if (!touch) {
              return;
            }

            swipeStart.current = {
              x: touch.clientX,
              y: touch.clientY,
            };
          }}
          onTouchEnd={(event) => {
            if (isZoomed || !swipeStart.current) {
              swipeStart.current = null;
              return;
            }

            const touch = event.changedTouches.item(0);
            if (!touch) {
              swipeStart.current = null;
              return;
            }

            const deltaX = touch.clientX - swipeStart.current.x;
            const deltaY = touch.clientY - swipeStart.current.y;
            swipeStart.current = null;

            if (
              Math.abs(deltaX) < SWIPE_DISTANCE ||
              Math.abs(deltaX) < Math.abs(deltaY) * SWIPE_AXIS_LOCK
            ) {
              return;
            }

            goTo(deltaX < 0 ? 1 : -1);
          }}
        >
          <div className="absolute left-4 top-4 z-20 rounded-full bg-[#18130f]/75 px-3 py-1 text-xs text-stone-400 ring-1 ring-white/10 backdrop-blur">
            {activeIndex + 1} / {photos.length}
          </div>

          <IconButton
            label="Previous photo"
            onClick={() => goTo(-1)}
            className="absolute left-3 top-1/2 z-20 -translate-y-1/2 max-lg:hidden sm:left-4"
          >
            <ArrowIcon direction="previous" />
          </IconButton>

          <TransformWrapper
            key={activePhoto.id}
            initialScale={MIN_ZOOM}
            minScale={MIN_ZOOM}
            maxScale={MAX_ZOOM}
            centerOnInit={false}
            centerZoomedOut={false}
            limitToBounds
            smooth={false}
            wheel={{ step: WHEEL_ZOOM_STEP }}
            pinch={{ step: 5, allowPanning: true }}
            panning={{
              disabled: !isZoomed,
              velocityDisabled: false,
            }}
            doubleClick={{
              mode: 'toggle',
              step: DOUBLE_CLICK_ZOOM_STEP,
              animationTime: 180,
              animationType: 'easeOut',
            }}
            onTransform={(_ref, state) => {
              const nextIsZoomed = state.scale > 1.01;
              setIsZoomed((current) =>
                current === nextIsZoomed ? current : nextIsZoomed,
              );
            }}
          >
            {({ zoomIn, zoomOut, resetTransform, state }) => (
              <>
                <div className="absolute right-4 top-16 z-20 flex items-center gap-2 lg:right-4 lg:top-4">
                  <IconButton
                    label="Zoom out"
                    onClick={() => zoomOut(BUTTON_ZOOM_STEP, 160, 'easeOut')}
                  >
                    <span aria-hidden="true" className="text-xl leading-none">
                      -
                    </span>
                  </IconButton>
                  <button
                    type="button"
                    onClick={() => resetTransform(160, 'easeOut')}
                    className="bg-[#17120f]/82 h-10 rounded-full px-3 text-xs text-stone-300 ring-1 ring-white/10 backdrop-blur transition hover:bg-stone-800 hover:text-white"
                  >
                    {Math.round(state.scale * 100)}%
                  </button>
                  <IconButton
                    label="Zoom in"
                    onClick={() => zoomIn(BUTTON_ZOOM_STEP, 160, 'easeOut')}
                  >
                    <span aria-hidden="true" className="text-xl leading-none">
                      +
                    </span>
                  </IconButton>
                </div>

                <TransformComponent
                  wrapperClass="!h-auto !w-screen !max-w-none lg:!h-full lg:!w-full"
                  contentClass="!block !h-auto !w-full"
                  wrapperStyle={{
                    cursor: isZoomed ? 'grab' : 'zoom-in',
                    overflowX: 'hidden',
                    overflowY: isZoomed ? 'hidden' : 'auto',
                    touchAction: isZoomed ? 'none' : 'pan-y pinch-zoom',
                  }}
                  contentStyle={{
                    display: 'block',
                    width: '100%',
                  }}
                >
                  <img
                    key={activePhoto.id}
                    src={activePhoto.src}
                    alt={activePhoto.title}
                    draggable={false}
                    loading="eager"
                    decoding="async"
                    className="block h-auto w-full max-w-none select-none object-contain"
                  />
                </TransformComponent>
              </>
            )}
          </TransformWrapper>

          <IconButton
            label="Next photo"
            onClick={() => goTo(1)}
            className="absolute right-3 top-1/2 z-20 -translate-y-1/2 max-lg:hidden sm:right-4"
          >
            <ArrowIcon direction="next" />
          </IconButton>
        </section>

        <aside className="bg-[#1d1915] lg:flex lg:h-full lg:w-[370px] lg:shrink-0 lg:flex-col lg:border-l lg:border-white/[0.08]">
          <div className="min-h-0 lg:flex lg:flex-1 lg:flex-col">
            <PhotoInfoPanel
              className="p-5 lg:max-h-[48%] lg:shrink-0 lg:overflow-y-auto lg:pr-14"
              photo={activePhoto}
            />
            <PhotoCommentsPanel className="lg:min-h-0 lg:flex-1" />
          </div>
        </aside>
      </div>
    </div>
  );
};

export { PhotoLightbox };
