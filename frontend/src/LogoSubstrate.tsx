import React from 'react';
import { Link } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import LogoLight from 'url:../public/assets/images/logo_substrate.svg';
import LogoDark from 'url:../public/assets/images/logo_substrate_onDark.svg';

interface Props {
  theme: boolean;
}

const useStyles = makeStyles({
  root: {
    display: 'block',
    width: '120px',
    '& img': {
      maxWidth: '100%',
    },
  },
});

const LogoSubstrate: React.FunctionComponent<Props> = ({ onClick, theme }: Props) => {
  const classes = useStyles();
  return  (
    <Link onClick={onClick} className={classes.root}>
      <img src={theme ? LogoLight : LogoDark}/>
    </Link>
  );
};

export default LogoSubstrate;
