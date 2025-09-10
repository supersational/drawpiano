/**
 * Modulo operation that handles negative numbers correctly
 */
export const mod = (n: number, m: number): number => ((n % m) + m) % m;

/**
 * Clamp a value between min and max
 */
export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Convert mouse events to touch events for unified handling
 */
export function mouseToTouch(element: HTMLElement): void {
  // Polyfill Touch and TouchEvent if needed
  if (typeof window.Touch === 'undefined' || typeof window.TouchEvent === 'undefined') {
    (window as any).Touch = function (config: any) {
      return Object.assign(config, {});
    };

    (window as any).TouchEvent = function (type: string, config: any) {
      const evt = new Event(type, {
        bubbles: config.bubbles,
        cancelable: config.cancelable,
        composed: config.composed,
      });
      delete config.bubbles;
      delete config.cancelable;
      delete config.composed;
      return Object.assign(evt, config);
    };
  }

  const convertMouse = (evt: MouseEvent): boolean => {
    if (evt.button !== 0) return true; // Only handle left clicks

    evt.preventDefault();
    evt.stopImmediatePropagation();
    element.dispatchEvent(changeMouseEventToTouchEvent(evt));
    return false;
  };

  const onMouseUp = (evt: MouseEvent): boolean => {
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('mousemove', convertMouse);
    return convertMouse(evt);
  };

  element.addEventListener('mousedown', (evt: MouseEvent) => {
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousemove', convertMouse);
    return convertMouse(evt);
  });

  function changeMouseEventToTouchEvent(evt: MouseEvent): TouchEvent {
    const touch = new (window as any).Touch({
      identifier: 9999,
      target: element,
      clientX: evt.clientX,
      clientY: evt.clientY,
      screenX: evt.screenX,
      screenY: evt.screenY,
      pageX: evt.pageX,
      pageY: evt.pageY,
    });

    const touchEventType =
      evt.type === 'mousedown'
        ? 'touchstart'
        : evt.type === 'mouseup'
          ? 'touchend'
          : evt.type === 'mousemove'
            ? 'touchmove'
            : 'touchstart';

    const touchEvent = new (window as any).TouchEvent(touchEventType, {
      cancelable: true,
      bubbles: true,
      composed: true,
      touches: [touch],
      targetTouches: [touch],
      changedTouches: [touch],
    });

    return touchEvent;
  }
}
