type TopPullInput = {
  currentTouchY: number;
  scrollTop: number;
  startTouchY: number;
};

const SCROLLABLE_OVERFLOW_VALUES = new Set(['auto', 'overlay', 'scroll']);

export const shouldPreventTopPull = ({
  currentTouchY,
  scrollTop,
  startTouchY,
}: TopPullInput) => currentTouchY > startTouchY && scrollTop <= 0;

export const getScrollableTouchTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) {
    return null;
  }

  let element: Element | null = target;

  while (
    element &&
    element !== document.body &&
    element !== document.documentElement
  ) {
    const style = window.getComputedStyle(element);
    const canScrollY =
      SCROLLABLE_OVERFLOW_VALUES.has(style.overflowY) &&
      element.scrollHeight > element.clientHeight;

    if (canScrollY) {
      return element as HTMLElement;
    }

    element = element.parentElement;
  }

  return null;
};

export const getPageScrollTop = () =>
  window.scrollY ||
  document.documentElement.scrollTop ||
  document.body.scrollTop ||
  0;
