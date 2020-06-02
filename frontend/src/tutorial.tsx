import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSpring, animated } from 'react-spring'
import { Alert, AlertTitle } from '@material-ui/lab';
import AppBar from '@material-ui/core/AppBar';
import Button from '@material-ui/core/Button';
import Box from '@material-ui/core/Box';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import CardHeader from '@material-ui/core/CardHeader';
import Checkbox from '@material-ui/core/Checkbox';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import Divider from '@material-ui/core/Divider';
import FeedbackIcon from '@material-ui/icons/Feedback';
import HelpIcon from '@material-ui/icons/Help';
import IconButton from '@material-ui/core/IconButton';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Toolbar from '@material-ui/core/Toolbar';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import marked from 'marked';
import { useLocation, useParams } from "react-router-dom";
import Zoom from '@material-ui/core/Zoom';
import Fade from '@material-ui/core/Fade';
import { TransitionProps } from '@material-ui/core/transitions';
import { Container } from "@material-ui/core";
import { URI } from 'vscode-uri';
import { deployInstance, getInstanceDetails, getUserDetails } from "./api";
import { TheiaInstance } from "./components";
import { Discoverer, Instance, Responder } from "./connect";
import { useHover, useInterval, useWindowMaxDimension } from './hooks';
import { useLifecycle, deploy, deploying, failed, initial, restart, setup, stop, stopping } from './lifecycle';
import { fetchWithTimeout } from "./utils";

import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import Stepper from '@material-ui/core/Stepper';
import Step from '@material-ui/core/Step';
import StepLabel from '@material-ui/core/StepLabel';
import StepContent from '@material-ui/core/StepContent';

import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import FormControl from '@material-ui/core/FormControl';
import Select from '@material-ui/core/Select';
import Skeleton from '@material-ui/lab/Skeleton';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      width: '100%',
    },
    button: {
      marginTop: theme.spacing(1),
      marginRight: theme.spacing(1),
    },
    actionsContainer: {
      marginBottom: theme.spacing(2),
    },
    resetContainer: {
      padding: theme.spacing(3),
    },
  }),
);

async function executeCommand(instance, command, data = {}) {
  console.log("execute", instance, command)
  try {
      const result = await instance.execute(command, data);
      console.log("res", result)
     // setResult(result);
  } catch (error) {
      console.log("error", error);
  }
}

function createSteps(instance) {
  const url = "";
  return [
      {label: 'Launch your instance',
       content: `First start by launching your instance in a personal instance`,
       actions: {launch: () => executeCommand(instance, "substrate.startNode", "/home/substrate/workspace/substrate-node-template")},
      {label: 'Access via PolkadotJS',
       content: `Use PolkadotJS Apps to interact with your chain.`,
       actions: {open: () => window.open(`https://polkadot.js.org/apps/?rpc=${url}`)}},
      {label: 'Add a new pallet dependency',
       content: `Using the nice integrated view`},
      {label: 'Relaunch your instance',
       content: `Stop and restart your instance. See how changes are reflected`,
       actions: {launch: () => executeCommand(instance, "substrate.startNode", "/home/substrate/workspace/substrate-node-template")}];
}

function VerticalLinearStepper({ instance }) {
    const classes = useStyles();
    const [activeStep, setActiveStep] = useState(0);
    const steps = createSteps(instance);
  
    const handleNext = () => {
      setActiveStep((prevActiveStep) => prevActiveStep + 1);
    };
  
    const handleBack = () => {
      setActiveStep((prevActiveStep) => prevActiveStep - 1);
    };
  
    const handleReset = () => {
      setActiveStep(0);
    };
  
    return (
      <div className={classes.root}>
        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map(({label, content, next, back, actions}, index) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
              <StepContent>
                <Typography>
                <span dangerouslySetInnerHTML={{__html:marked(content)}}></span>
                </Typography>
                {actions &&
                <div className={classes.actionsContainer}>
                  <div>
                    {Object.entries(actions).map((o) => (
                    <Button
                      onClick={o[1]}
                      className={classes.button}
                    >
                      {o[0]}
                    </Button>
                    ))
                    }
                  </div>
                </div>
                }
                <div className={classes.actionsContainer}>
                  <div>
                    <Button
                      disabled={activeStep === 0}
                      onClick={() => {handleBack(); if (back) back();}}
                      className={classes.button}
                    >
                      Back
                    </Button>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => {handleNext(); if (next) next();}}
                      className={classes.button}
                    >
                      {activeStep === steps.length - 1 ? 'Finish' : 'Next'}
                    </Button>
                  </div>
                </div>
              </StepContent>
            </Step>
          ))}
        </Stepper>
        {activeStep === steps.length && (
          <Paper square elevation={0} className={classes.resetContainer}>
            <Typography>Congrats, you're done!</Typography>
            <Button onClick={handleReset} className={classes.button}>
              Restart
            </Button>
          </Paper>
        )}
      </div>
    );
  }

const template = "workshop";

function Cartouche({children}) {
    return (
    <Paper style={{display: "flex", flex: 1, alignItems: "center"}}>
        <div style={{display: "flex", flex: 1, alignItems: "center", justifyContent: "center", height: "50vh"}}>
            {children}
        </div>
    </Paper>
    );
}

function TutorialController({uuid}) {
    const instance = new Instance(uuid);
    return (
      <div style={{display: "flex", flex: 1, alignItems: "center", justifyContent: "center"}}>
        <div style={{flex: 1}}>
            <VerticalLinearStepper instance={instance} />
        </div>
        <div style={{flex: 2, margin: 20, height: "50vh"}}>
            <TheiaInstance uuid={uuid} />
        </div>
      </div>
    );
}

function Media() {
  return (
    <Card style={{width: 200}}>
      <CardHeader
        avatar={<Skeleton animation="wave" variant="circle" width={40} height={40} />}
        title={<Skeleton animation="wave" height={10} width="80%" style={{ marginBottom: 6 }} />}
        subheader={<Skeleton animation="wave" height={10} width="40%" />}
      />
      <Skeleton animation="wave" variant="rect" height={80} />
      <CardContent>
        <React.Fragment>
          <Skeleton animation="wave" height={10} style={{ marginBottom: 6 }} />
          <Skeleton animation="wave" height={10} width="80%" />
        </React.Fragment>
      </CardContent>
    </Card>
  );
}

export function TutorialPanel() {
    const [instanceUUID, setInstanceUUID] = useState(null);
    useEffect(() => {
        async function fetchData() {
            const { result, error } = await getUserDetails(localStorage.getItem("userUUID"));
            if (error) {
                // This instance doesn't exist
                return;
            }

            const instance = result[0];
            if (instance?.template?.name == template) {
              // TODO handle errors
              setInstanceUUID(instance.instance_uuid);
            }
        }

        fetchData();
      }, []);

    async function createInstance() {
        const {result, error} = await deployInstance(localStorage.getItem("userUUID"), template);
        if (result) {
          setInstanceUUID(result);
        }
    }

    return (
      <div style={{display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", margin: 20}}>
        <Media />
        <div style={{width: "100%", margin: 20}}>
          {instanceUUID ?
          <TutorialController uuid={instanceUUID} />
          :
          <Cartouche>
              <Container style={{display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center"}}>
                  <Typography>Wan't to give it a try?</Typography>
                  <Button onClick={createInstance}>GO</Button>
              </Container> 
          </Cartouche>
          }
        </div>
        <Media />
      </div>
      );
}
