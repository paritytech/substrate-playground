import React, { MouseEventHandler } from 'react';
import { Link } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import LogoLight from 'url:../public/assets/images/logo_substrate.svg';
import LogoDark from 'url:../public/assets/images/logo_substrate_onDark.svg';

const useStyles = makeStyles({
  root: {
    display: 'block',
    width: '120px',
    '& img': {
      maxWidth: '130%',
    },
  },
});

export function LogoSubstrate({ onClick, theme }: { onClick: MouseEventHandler | undefined, theme: boolean }): JSX.Element {
  const classes = useStyles();
  return  (
    <Link onClick={onClick} className={classes.root}>
      <img src={theme ? LogoLight : LogoDark}/>
    </Link>
  );
};
