import { MutableRefObject, useCallback, useState, useEffect, useRef } from "react";

/*
 * Based on https://codesandbox.io/s/usehover-v2-jxfdp
 */
export function useHover() {
  const [value, setValue] = useState(false);
	
  // Wrap in useCallback so we can use in dependencies below
  const handleMouseOver = useCallback(() => setValue(true), []);
  const handleMouseOut = useCallback(() => setValue(false), []);

  // Keep track of the last node passed to callbackRef
  // so we can remove its event listeners.
  const ref = useRef();
  
  // Use a callback ref instead of useEffect so that event listeners
  // get changed in the case that the returned ref gets added to
  // a different element later. With useEffect, changes to ref.current
  // wouldn't cause a rerender and thus the effect would run again.
  const callbackRef = useCallback(
    node => {
      if (ref.current) {
        ref.current.removeEventListener("mouseover", handleMouseOver);
        ref.current.removeEventListener("mouseout", handleMouseOut);
      }

      ref.current = node;

      if (ref.current) {
        ref.current.addEventListener("mouseover", handleMouseOver);
        ref.current.addEventListener("mouseout", handleMouseOut);
      }
    },
    [handleMouseOver, handleMouseOut]
  );

  return [callbackRef, value];
}

export function useWindowMaxDimension() {
    function clientDimension() {return Math.max(document.documentElement.clientWidth, document.documentElement.clientHeight)}
    const [dimension, setDimension] = useState(clientDimension());
    
    useEffect(() => {
        const handleResize = () => setDimension(clientDimension());
        const event = 'resize';
        window.addEventListener(event, handleResize);
        return () => window.removeEventListener(event, handleResize);
    });
    
    return dimension;
}

export function useInterval(callback: () => void, delay: number) {
  const savedCallback = useRef() as MutableRefObject<() => void>;

  useEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    function tick() {
      savedCallback.current();
    }

    let id = setInterval(tick, delay);
    return () => clearInterval(id);
  }, [delay]);
}
