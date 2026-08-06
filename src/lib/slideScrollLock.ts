type SlideScrollLockStyleSnapshot = {
  overflow?: string;
  overscrollBehavior?: string;
  position?: string;
  touchAction?: string;
};

type SlideScrollLockCleanupPlanInput = {
  body: SlideScrollLockStyleSnapshot;
  pathname: string;
  root: SlideScrollLockStyleSnapshot;
};

type SlideScrollLockCleanupPlan = {
  body: string[];
  root: string[];
};

const BODY_LOCK_PROPERTIES = [
  'height',
  'left',
  'overflow',
  'overscrollBehavior',
  'position',
  'right',
  'touchAction',
  'top',
  'width',
];

const ROOT_LOCK_PROPERTIES = [
  '--slide-viewport-height',
  ...BODY_LOCK_PROPERTIES,
];

const hasSlideScrollLockSignature = ({
  overflow,
  overscrollBehavior,
  position,
  touchAction,
}: SlideScrollLockStyleSnapshot) =>
  overflow === 'hidden' ||
  overscrollBehavior === 'none' ||
  position === 'fixed' ||
  touchAction === 'none';

const hasFullSlideScrollLockSignature = ({
  overscrollBehavior,
  position,
  touchAction,
}: SlideScrollLockStyleSnapshot) =>
  overscrollBehavior === 'none' ||
  position === 'fixed' ||
  touchAction === 'none';

const getCleanupProperties = (
  snapshot: SlideScrollLockStyleSnapshot,
  fullProperties: string[],
) => {
  if (hasFullSlideScrollLockSignature(snapshot)) {
    return fullProperties;
  }

  if (snapshot.overflow === 'hidden') {
    return ['overflow'];
  }

  return [];
};

export const getSlideScrollLockCleanupPlan = ({
  body,
  pathname,
  root,
}: SlideScrollLockCleanupPlanInput): SlideScrollLockCleanupPlan => {
  if (pathname === '/slide') {
    return {
      body: [],
      root: [],
    };
  }

  return {
    body: getCleanupProperties(body, BODY_LOCK_PROPERTIES),
    root: hasSlideScrollLockSignature(root)
      ? getCleanupProperties(root, ROOT_LOCK_PROPERTIES)
      : [],
  };
};

export const clearStaleSlideScrollLock = (pathname: string) => {
  const { body, documentElement: root } = document;
  const plan = getSlideScrollLockCleanupPlan({
    body: body.style,
    pathname,
    root: root.style,
  });

  plan.root.forEach((property) => {
    root.style.removeProperty(property);
  });
  plan.body.forEach((property) => {
    body.style.removeProperty(property);
  });
};
