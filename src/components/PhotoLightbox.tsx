/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';

import { PhotoCommentsPanel } from '@/components/PhotoCommentsPanel';
import { PhotoInfoPanel } from '@/components/PhotoInfoPanel';
import { getPhotoTitle, type Photo } from '@/lib/photos';

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

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const IconButton = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    children: ReactNode;
    onClick: () => void;
    className?: string;
  }
>(({ label, children, onClick, className = '' }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    onClick={onClick}
    className={`bg-[#17120f]/82 grid size-10 place-items-center rounded-full text-stone-200 ring-1 ring-white/10 backdrop-blur transition hover:bg-stone-800 hover:text-white ${className}`}
  >
    {children}
  </button>
));

IconButton.displayName = 'IconButton';

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
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
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

      if (event.key === 'Tab') {
        const focusableElements = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            FOCUSABLE_SELECTOR,
          ) ?? [],
        ).filter((element) => element.offsetParent !== null);

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (!firstElement || !lastElement) {
          return;
        }

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }

      if (event.key === 'ArrowLeft') {
        goTo(-1);
      }

      if (event.key === 'ArrowRight') {
        goTo(1);
      }
    };

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus({
      preventScroll: true,
    });

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus({
        preventScroll: true,
      });
    };
  }, [goTo, onClose]);

  useEffect(() => {
    setIsZoomed(false);
    swipeStart.current = null;
  }, [activeIndex]);

  if (!activePhoto) {
    return null;
  }

  const isPortraitPhoto = activePhoto.height > activePhoto.width;
  const imageClassName = isPortraitPhoto
    ? 'mx-auto block h-full w-auto max-w-full select-none object-contain'
    : 'mx-auto block h-auto max-h-full w-full select-none object-contain';

  return (
    <div
      ref={dialogRef}
      className="bg-[#090706]/88 fixed inset-0 z-50 overflow-y-auto text-stone-100 backdrop-blur-md lg:flex lg:items-center lg:justify-center lg:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={activePhoto.title}
    >
      <div className="relative min-h-svh w-full bg-[#18130f] shadow-2xl shadow-black/50 lg:flex lg:h-[92vh] lg:min-h-0 lg:w-[94vw] lg:max-w-[1480px] lg:overflow-hidden lg:rounded-[22px] lg:border lg:border-white/[0.09]">
        <IconButton
          ref={closeButtonRef}
          label="Close lightbox"
          onClick={onClose}
          className="fixed right-3 top-3 z-30 lg:absolute lg:right-4 lg:top-4"
        >
          <CloseIcon />
        </IconButton>

        <section
          className="relative h-[78svh] min-h-[360px] w-screen overflow-hidden bg-[#0f0d0b] lg:h-full lg:min-h-0 lg:w-auto lg:flex-1"
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
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden bg-[#0f0d0b]"
          >
            <img
              key={`${activePhoto.id}-ambient`}
              src={activePhoto.thumbnail}
              alt=""
              draggable={false}
              className="saturate-125 size-full scale-110 object-cover opacity-45 blur-2xl brightness-75"
            />
            <div className="absolute inset-0 bg-[#11100e]/45" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(17,16,14,0.72)_0%,rgba(17,16,14,0.18)_28%,rgba(17,16,14,0.18)_72%,rgba(17,16,14,0.72)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(17,16,14,0.5)_0%,rgba(17,16,14,0.05)_24%,rgba(17,16,14,0.05)_76%,rgba(17,16,14,0.5)_100%)]" />
          </div>

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
                    aria-label="Reset zoom"
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
                  wrapperClass="!relative !z-10 !h-full !w-screen !max-w-none lg:!w-full"
                  contentClass="!flex !h-full !w-full !items-center !justify-center"
                  wrapperStyle={{
                    cursor: isZoomed ? 'grab' : 'zoom-in',
                    overflowX: 'hidden',
                    overflowY: 'hidden',
                    touchAction: isZoomed ? 'none' : 'pan-y pinch-zoom',
                  }}
                  contentStyle={{
                    alignItems: 'center',
                    justifyContent: 'center',
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
                    className={`${imageClassName} relative z-10 shadow-[0_24px_90px_rgba(0,0,0,0.36)]`}
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

          <div className="bg-[#17120f]/82 absolute inset-x-3 bottom-3 z-20 flex items-center justify-between rounded-full p-1 ring-1 ring-white/10 backdrop-blur lg:hidden">
            <IconButton
              label="Previous photo"
              onClick={() => goTo(-1)}
              className="bg-transparent ring-0"
            >
              <ArrowIcon direction="previous" />
            </IconButton>
            <Link
              href={`/photos/${activePhoto.id}`}
              className="rounded-full px-4 py-2 text-sm font-medium text-stone-200 transition hover:bg-white/10 hover:text-white"
            >
              Detail
            </Link>
            <IconButton
              label="Next photo"
              onClick={() => goTo(1)}
              className="bg-transparent ring-0"
            >
              <ArrowIcon direction="next" />
            </IconButton>
          </div>
        </section>

        <aside className="bg-[#1d1915] lg:flex lg:h-full lg:w-[390px] lg:shrink-0 lg:flex-col lg:border-l lg:border-white/[0.08]">
          <div className="min-h-0 lg:flex lg:flex-1 lg:flex-col">
            <div className="hidden border-b border-white/[0.07] px-5 py-4 lg:block">
              <p className="text-xs font-semibold text-[#9db6b0]">
                Metadata inspector
              </p>
              <h2 className="mt-1 line-clamp-2 text-base font-semibold leading-6 text-stone-100">
                {getPhotoTitle(activePhoto)}
              </h2>
              <Link
                href={`/photos/${activePhoto.id}`}
                className="mt-3 inline-flex rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-stone-300 transition hover:bg-white/10 hover:text-white"
              >
                Open detail page
              </Link>
            </div>
            <PhotoInfoPanel
              className="p-5 lg:max-h-[58%] lg:shrink-0 lg:overflow-y-auto lg:pr-14"
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
