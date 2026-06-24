import '../styles/global.css';

import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

const LANDSCAPE_REDIRECT_STORAGE_KEY = 'slide-landscape-redirected-at';
const LANDSCAPE_REDIRECT_DEBOUNCE_MS = 240;
const LANDSCAPE_REDIRECT_COOLDOWN_MS = 3500;
const MOBILE_SCREEN_LIMIT = 900;

const useRemoveNextFoucGuard = () => {
  useEffect(() => {
    document.querySelector('style[data-next-hide-fouc]')?.remove();
  }, []);
};

const useLandscapeSlideRedirect = () => {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) {
      return undefined;
    }

    let debounceId: number | undefined;

    const shouldSkipPath = () =>
      router.pathname === '/slide' || router.pathname.startsWith('/admin');

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
        router.push('/slide').catch(() => undefined);
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
  useLandscapeSlideRedirect();

  return <Component {...pageProps} />;
};

export default MyApp;
