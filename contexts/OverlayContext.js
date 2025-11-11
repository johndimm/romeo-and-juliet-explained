import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

const OverlayContext = createContext({
  overlay: null,
  openOverlay: () => {},
  closeOverlay: () => {},
});

export function OverlayProvider({ children }) {
  const router = useRouter();
  const [overlay, setOverlay] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;
    const { overlay: overlayParam, view } = router.query || {};
    const value = typeof overlayParam === 'string' ? overlayParam : (typeof view === 'string' ? view : null);
    setOverlay(value || null);
  }, [router.isReady, router.query]);

  const openOverlay = useCallback(
    (name, { shallow = true } = {}) => {
      if (!name) return;
      const query = { ...router.query, overlay: name };
      delete query.view;
      router.push({ pathname: router.pathname, query }, undefined, { shallow, scroll: false });
    },
    [router],
  );

  const closeOverlay = useCallback(
    ({ shallow = true } = {}) => {
      const query = { ...router.query };
      delete query.overlay;
      delete query.view;
      router.push({ pathname: router.pathname, query }, undefined, { shallow, scroll: false });
    },
    [router],
  );

  const value = useMemo(
    () => ({
      overlay,
      openOverlay,
      closeOverlay,
    }),
    [overlay, openOverlay, closeOverlay],
  );

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function useOverlay() {
  return useContext(OverlayContext);
}

