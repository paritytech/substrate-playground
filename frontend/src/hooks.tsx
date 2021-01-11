import { MutableRefObject, useEffect, useState, useRef } from "react";

export function useInterval(callback: () => void, delay: number): void {
  const savedCallback = useRef() as MutableRefObject<() => void>;

  useEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    function tick() {
      savedCallback.current();
    }

    const id = setInterval(tick, delay);
    return () => clearInterval(id);
  }, [delay]);
}
