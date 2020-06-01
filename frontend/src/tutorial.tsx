import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSpring, animated } from 'react-spring'
import { Alert, AlertTitle } from '@material-ui/lab';
import AppBar from '@material-ui/core/AppBar';
import Button from '@material-ui/core/Button';
import Box from '@material-ui/core/Box';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
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
import { getInstanceDetails, getUserDetails } from "./api";
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
import Button from '@material-ui/core/Button';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';

import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import FormControl from '@material-ui/core/FormControl';
import Select from '@material-ui/core/Select';
import { deployImage } from "./api";

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

function getSteps() {
  return [
      {label: 'Launch your instance',
       content:
       `For each ad campaign that you create, you can control how much
       you're willing to spend on clicks and conversions, which networks
       and geographical locations you want your ads to show on, and more.
       
* 1
* 2`},
      {label: 'Start the tour',
       content:
       `An ad group contains one or more ads which target a shared set of keywords.`},
      {label: 'Create an ad',
       content:
       `Try out different ad text to see what brings in the most customers,
       and learn how to enhance your ads using features like ad extensions.
       If you run into any problems with your ads, find out how to tell if
       they're running and how to resolve approval issues.`}];
}

// First button to deploy instance

function VerticalLinearStepper() {
    const classes = useStyles();
    const [instance, setInstance] = useState(null);
    const [activeStep, setActiveStep] = useState(0);
    const steps = getSteps();
  
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
          {steps.map(({label, content}, index) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
              <StepContent>
                <Typography>
                <span dangerouslySetInnerHTML={{__html:marked(content)}}></span>
                </Typography>
                <div className={classes.actionsContainer}>
                  <div>
                    <Button
                      disabled={activeStep === 0}
                      onClick={handleBack}
                      className={classes.button}
                    >
                      Back
                    </Button>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleNext}
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
            <Typography>All steps completed - you&apos;re finished</Typography>
            <Button onClick={handleReset} className={classes.button}>
              Reset
            </Button>
          </Paper>
        )}
      </div>
    );
  }

const template = "workshop";

function TutorialController({uuid}) {
    return (
    <Paper style={{display: "flex", height: "100vh", alignItems: "center"}}>
        <div style={{display: "flex", flex: 1, alignItems: "center"}}>
            <VerticalLinearStepper />
        </div>
        <div style={{display: "flex", flex: 1, margin: 20, height: "60vh"}}>
            <TheiaInstance uuid={uuid} />
        </div>
    </Paper>
    );
}

export function TutorialPanel() {
    const [data, setData] = useState({type: "LOADING"});
    const [existingInstances, setExistingInstances] = useState([]);
    useEffect(() => {
        async function fetchData() {
            const { result, error } = await getUserDetails(localStorage.getItem("userUUID"));
            if (error) {
                // This instance doesn't exist
                setData({type: "ERROR", value: "Couldn't locate the theia instance", action: () => history.push("/")});
                return;
            }

            setExistingInstances(result);
        }

        if (data.type != "ERROR" && data.type != "SUCCESS") {
            fetchData();
        }
      }, []);

    if (existingInstances.length > 0) {
        const instance = existingInstances[0];
        if (instance.template.name == template) {
            return (<TutorialController uuid={instance.instance_uuid} />);
        } else {
            return <div>An instance with a different template is already running</div>;
        }
    } else {
        return <div>LOADING</div>;
    }
}
