import React, { useEffect, useMemo } from "react";
import { Box, useInput, useStdout } from "ink"

import useScreenSize from "./useScreenSize.js";

export const Screen = ({ children }) => {
  const { height, width } = useScreenSize();
  const { stdout } = useStdout();

  useMemo(() => stdout.write("\x1b[?1049h"), [stdout]);
  useEffect(() => () => {stdout.write("\x1b[?1049l")}, [stdout]);
  useInput(() => {})

  return <Box height={height} width={width}>{children}</Box>;
};
