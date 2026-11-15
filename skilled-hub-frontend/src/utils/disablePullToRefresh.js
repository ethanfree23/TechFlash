/**
 * Block the browser/WebView pull-to-refresh gesture that reloads the whole SPA
 * when the user pulls down at the top of the page.
 *
 * CSS `overscroll-behavior-y: none` covers modern browsers; this touch guard
 * covers remaining Chromium/WebView cases (including Capacitor Android).
 */
export function disablePullToRefresh() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  let startY = 0;

  const onTouchStart = (event) => {
    if (event.touches.length !== 1) return;
    startY = event.touches[0].clientY;
  };

  const onTouchMove = (event) => {
    if (event.touches.length !== 1) return;
    // Only intervene when the document itself is scrolled to the top and the
    // finger is moving downward (the pull-to-refresh direction).
    if (window.scrollY > 0) return;
    const currentY = event.touches[0].clientY;
    const deltaY = currentY - startY;
    if (deltaY <= 0) return;

    const target = event.target;
    if (!(target instanceof Element)) {
      event.preventDefault();
      return;
    }

    // Let nested scroll containers handle the gesture when they can still scroll.
    let node = target;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY;
      const canScrollY =
        (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
        node.scrollHeight > node.clientHeight;
      if (canScrollY && node.scrollTop > 0) return;
      node = node.parentElement;
    }

    event.preventDefault();
  };

  document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
}
