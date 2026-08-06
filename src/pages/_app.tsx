import '../styles/global.css';

import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';

import {
  getPageScrollTop,
  getScrollableTouchTarget,
  shouldPreventTopPull,
} from '@/lib/mobileScrollGuard';
import {
  hasSlideLandscapeRequest,
  isWeChatBrowser,
  markSlideLandscapeRequest,
  shouldAutoRedirectLandscapeToSlideAfterRequest,
} from '@/lib/slideOrientation';
import { clearStaleSlideScrollLock } from '@/lib/slideScrollLock';

const LANDSCAPE_REDIRECT_STORAGE_KEY = 'slide-landscape-redirected-at';
const LANDSCAPE_REDIRECT_DEBOUNCE_MS = 240;
const LANDSCAPE_REDIRECT_COOLDOWN_MS = 3500;
const MOBILE_SCREEN_LIMIT = 900;

const useRemoveNextFoucGuard = () => {
  useEffect(() => {
    document.querySelector('style[data-next-hide-fouc]')?.remove();
  }, []);
};

const useWeChatPullToRefreshGuard = () => {
  const router = useRouter();
  const startTouchYRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      !router.isReady ||
      router.pathname.startsWith('/admin') ||
      router.pathname === '/slide'
    ) {
      return undefined;
    }

    const handleTouchStart = (event: TouchEvent) => {
      startTouchYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const startTouchY = startTouchYRef.current;
      const currentTouchY = event.touches[0]?.clientY;

      if (startTouchY === null || currentTouchY === undefined) {
        return;
      }

      const scrollableTarget = getScrollableTouchTarget(event.target);
      const scrollTop = scrollableTarget?.scrollTop ?? getPageScrollTop();

      if (
        shouldPreventTopPull({
          currentTouchY,
          scrollTop,
          startTouchY,
        })
      ) {
        event.preventDefault();
      }
    };

    const clearTouchStart = () => {
      startTouchYRef.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart, {
      capture: true,
      passive: true,
    });
    document.addEventListener('touchmove', handleTouchMove, {
      capture: true,
      passive: false,
    });
    document.addEventListener('touchend', clearTouchStart, {
      capture: true,
      passive: true,
    });
    document.addEventListener('touchcancel', clearTouchStart, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart, true);
      document.removeEventListener('touchmove', handleTouchMove, true);
      document.removeEventListener('touchend', clearTouchStart, true);
      document.removeEventListener('touchcancel', clearTouchStart, true);
    };
  }, [router.isReady, router.pathname]);
};

const useClearStaleSlideScrollLock = () => {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    clearStaleSlideScrollLock(router.pathname);
  }, [router.isReady, router.pathname]);
};

const useLandscapeSlideRedirect = () => {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) {
      return undefined;
    }

    let debounceId: number | undefined;

    const shouldSkipPath = () =>
      !shouldAutoRedirectLandscapeToSlideAfterRequest({
        hasLandscapeRequest: hasSlideLandscapeRequest(),
        pathname: router.pathname,
      });

    const hasRecentRedirect = () => {
      const redirectedAt = Number(
        window.sessionStorage.getItem(LANDSCAPE_REDIRECT_STORAGE_KEY) ?? '0',
      );

      return Date.now() - redirectedAt < LANDSCAPE_REDIRECT_COOLDOWN_MS;
    };

    const isMobileLandscape = () => {
      const hasCoarsePointer =
        window.matchMedia('(pointer: coarse)').matches ||
        window.navigator.maxTouchPoints > 0;
      const compactScreen = window.innerWidth <= MOBILE_SCREEN_LIMIT;

      return (
        hasCoarsePointer &&
        compactScreen &&
        window.innerWidth > window.innerHeight
      );
    };

    const checkOrientation = () => {
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        if (shouldSkipPath() || !isMobileLandscape() || hasRecentRedirect()) {
          return;
        }

        window.sessionStorage.setItem(
          LANDSCAPE_REDIRECT_STORAGE_KEY,
          String(Date.now()),
        );
        markSlideLandscapeRequest();

        if (isWeChatBrowser()) {
          window.location.replace('/slide');
          return;
        }

        router.replace('/slide').catch(() => undefined);
      }, LANDSCAPE_REDIRECT_DEBOUNCE_MS);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.clearTimeout(debounceId);
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [router]);
};

const MyApp = ({ Component, pageProps }: AppProps) => {
  useRemoveNextFoucGuard();
  useClearStaleSlideScrollLock();
  useWeChatPullToRefreshGuard();
  useLandscapeSlideRedirect();

  return <Component {...pageProps} />;
};

export default MyApp;
