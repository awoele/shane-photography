/* eslint-disable @next/next/no-img-element */
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  type WheelEvent,
} from 'react';

import { PhotoInfoPanel } from '@/components/PhotoInfoPanel';
import { formatCategoryLabel, type Photo } from '@/lib/photos';

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

const CommentsPanel = () => {
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');

  const handleSend = () => {
    setDraft('');
    setStatus('Comments are not enabled yet.');
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col border-t border-white/[0.07]">
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <h3 className="text-sm font-semibold text-stone-100">Comments</h3>
        <div className="mt-5 rounded-2xl border border-white/[0.06] bg-[#17120f]/60 px-4 py-5 text-sm text-stone-500">
          No comments yet.
        </div>
      </div>

      <div className="shrink-0 border-t border-white/[0.07] p-4">
        <div className="flex items-center gap-2 rounded-full bg-[#15110e] p-1.5 ring-1 ring-white/[0.08]">
          <input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setStatus('');
            }}
            placeholder="Say something..."
            className="min-w-0 flex-1 bg-transparent px-3 text-sm text-stone-200 outline-none placeholder:text-stone-600"
          />
          <button
            type="button"
            onClick={handleSend}
            className="rounded-full bg-[#9db6b0] px-4 py-2 text-xs font-semibold text-[#17110e] transition hover:bg-[#b7cec8]"
          >
            Send
          </button>
        </div>
        {status ? (
          <p className="mt-2 text-xs text-stone-500">{status}</p>
        ) : null}
      </div>
    </section>
  );
};

const PhotoLightbox = ({
  photos,
  activeIndex,
  onClose,
  onSelectIndex,
}: PhotoLightboxProps) => {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const activePhoto = photos[activeIndex];
  const pointers = useRef<Map<number, Point>>(new Map());
  const pinchStartDistance = useRef(0);
  const pinchStartZoom = useRef(MIN_ZOOM);
  const lastPanPoint = useRef<Point | null>(null);

  const resetView = () => {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  };

  const goTo = (offset: number) => {
    if (photos.length === 0) {
      return;
    }

    const nextIndex = (activeIndex + offset + photos.length) % photos.length;
    resetView();
    onSelectIndex(nextIndex);
  };

  const setZoomSafely = (nextZoom: number) => {
    const clamped = clampZoom(nextZoom);

    setZoom(clamped);

    if (clamped === MIN_ZOOM) {
      setPan({ x: 0, y: 0 });
    }
  };

  const zoomIn = () => {
    setZoom((current) => clampZoom(current + ZOOM_STEP));
  };

  const zoomOut = () => {
    setZoom((current) => {
      const nextZoom = clampZoom(current - ZOOM_STEP);

      if (nextZoom === MIN_ZOOM) {
        setPan({ x: 0, y: 0 });
      }

      return nextZoom;
    });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) => {
      const nextZoom = clampZoom(
        current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP),
      );

      if (nextZoom === MIN_ZOOM) {
        setPan({ x: 0, y: 0 });
      }

      return nextZoom;
    });
  };

  const updatePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = {
      x: event.clientX,
      y: event.clientY,
    };

    pointers.current.set(event.pointerId, point);

    return point;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = updatePointer(event);

    if (pointers.current.size === 1) {
      lastPanPoint.current = point;
    }

    if (pointers.current.size === 2) {
      const points = Array.from(pointers.current.values());
      const first = points[0];
      const second = points[1];

      if (first && second) {
        pinchStartDistance.current = getDistance(first, second);
        pinchStartZoom.current = zoom;
        lastPanPoint.current = null;
      }
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) {
      return;
    }

    const point = updatePointer(event);

    if (pointers.current.size === 2 && pinchStartDistance.current > 0) {
      const points = Array.from(pointers.current.values());
      const first = points[0];
      const second = points[1];

      if (first && second) {
        const distance = getDistance(first, second);
        setZoomSafely(
          pinchStartZoom.current * (distance / pinchStartDistance.current),
        );
      }

      return;
    }

    if (
      pointers.current.size === 1 &&
      zoom > MIN_ZOOM &&
      lastPanPoint.current
    ) {
      const deltaX = point.x - lastPanPoint.current.x;
      const deltaY = point.y - lastPanPoint.current.y;

      setPan((current) => ({
        x: current.x + deltaX,
        y: current.y + deltaY,
      }));
      lastPanPoint.current = point;
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);

    if (pointers.current.size === 1) {
      const remainingPoint = Array.from(pointers.current.values())[0];
      lastPanPoint.current = remainingPoint ?? null;
      pinchStartDistance.current = 0;
      pinchStartZoom.current = zoom;
      return;
    }

    pointers.current.clear();
    lastPanPoint.current = null;
    pinchStartDistance.current = 0;
    pinchStartZoom.current = zoom;
  };

  const handleDoubleClick = () => {
    if (zoom === MIN_ZOOM) {
      setZoom(2);
      return;
    }

    resetView();
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
    resetView();
    pointers.current.clear();
    lastPanPoint.current = null;
    pinchStartDistance.current = 0;
    pinchStartZoom.current = MIN_ZOOM;
  }, [activeIndex]);

  if (!activePhoto) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#090706]/80 p-2 text-stone-100 backdrop-blur-md sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={activePhoto.title}
    >
      <div className="flex h-[94svh] max-h-[92vh] w-[94vw] max-w-[1440px] overflow-hidden rounded-[22px] border border-white/[0.09] bg-[#18130f] shadow-2xl shadow-black/50 max-md:flex-col md:h-[90vh]">
        <section className="relative flex min-h-0 flex-1 items-center justify-center bg-[#11100e] max-md:min-h-[52svh]">
          <div className="absolute left-4 top-4 z-10 rounded-full bg-[#18130f]/75 px-3 py-1 text-xs text-stone-400 ring-1 ring-white/10 backdrop-blur">
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
              onClick={resetView}
              className="hidden h-10 rounded-full bg-[#17120f]/80 px-3 text-xs text-stone-300 ring-1 ring-white/10 transition hover:bg-stone-800 hover:text-white sm:block"
            >
              {Math.round(zoom * 100)}%
            </button>
            <IconButton label="Zoom in" onClick={zoomIn}>
              <span aria-hidden="true" className="text-xl leading-none">
                +
              </span>
            </IconButton>
            <button
              type="button"
              onClick={resetView}
              className="hidden h-10 rounded-full bg-[#17120f]/80 px-3 text-xs text-stone-300 ring-1 ring-white/10 transition hover:bg-stone-800 hover:text-white lg:block"
            >
              Reset
            </button>
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
            className={`flex size-full items-center justify-center overflow-hidden px-4 py-14 sm:px-12 ${
              zoom > MIN_ZOOM ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onWheel={handleWheel}
            style={{ touchAction: 'none' }}
          >
            <img
              key={activePhoto.id}
              src={activePhoto.src}
              alt={activePhoto.title}
              draggable={false}
              className="max-h-full max-w-full select-none object-contain transition-transform duration-150 ease-out"
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              }}
            />
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

        <aside className="flex w-full shrink-0 flex-col border-t border-white/[0.08] bg-[#1d1915] md:h-full md:w-[340px] md:border-l md:border-t-0 lg:w-[360px]">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-stone-100">
                {formatCategoryLabel(activePhoto.category) || '—'}
              </p>
              <p className="mt-0.5 text-xs text-stone-500">Category</p>
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

          <div className="flex min-h-0 flex-1 flex-col">
            <PhotoInfoPanel
              photo={activePhoto}
              className="max-h-[45%] shrink-0 overflow-y-auto p-5 md:max-h-[52%]"
            />
            <CommentsPanel />
          </div>
        </aside>
      </div>
    </div>
  );
};

export { PhotoLightbox };
