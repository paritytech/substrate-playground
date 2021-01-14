import { useEffect } from "react";

export function useInterval(callback: () => void, delay: number): void {
  useEffect(() => {
    const id = setInterval(callback, delay);
    callback();
    return () => clearInterval(id);
  }, []);
}
