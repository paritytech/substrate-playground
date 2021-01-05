import marked from 'marked';
import React, { useEffect, useState } from "react";
import Button from '@material-ui/core/Button';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import CardHeader from '@material-ui/core/CardHeader';
import CircularProgress from '@material-ui/core/CircularProgress';
import Container from "@material-ui/core/Container";
import Paper from '@material-ui/core/Paper';
import Step from '@material-ui/core/Step';
import StepContent from '@material-ui/core/StepContent';
import Stepper from '@material-ui/core/Stepper';
import StepLabel from '@material-ui/core/StepLabel';
import Skeleton from '@material-ui/lab/Skeleton';
import Typography from '@material-ui/core/Typography';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import { Client } from "@substrate/playground-client";
import { startNode } from "../commands";
import { Instance } from "../connect";
import { TheiaInstance } from "../theia";

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

//Array<object>

function createSpecs(instance: Instance): object {
  const url = `wss://${instance.uuid}.playground-staging.substrate.dev/wss`;
  return {template: "node-template",
          steps:
          [{label: 'Launch your instance',
            content: `First start by launching your instance in a personal instance`,
            actions: {launch: () => startNode(instance, "/home/substrate/workspace")}},
          {label: 'Access via PolkadotJS',
            content: `Use PolkadotJS Apps to interact with your chain.`,
            actions: {open: () => window.open(`https://polkadot.js.org/apps/?rpc=${url}`)}},
          {label: 'Add a new pallet dependency',
            content: `Using the nice integrated view`},
          {label: 'Relaunch your instance',
            content: `Stop and restart your instance. See how changes are reflected`,
            actions: {launch: () => startNode(instance, "/home/substrate/workspace")}}]};
}

function VerticalLinearStepper({ steps }) {
    const classes = useStyles();
    const [activeStep, setActiveStep] = useState(0);

    const handleNext = () => {
      setActiveStep((prevActiveStep) => prevActiveStep + 1);
    };

    const handleBack = () => {
      setActiveStep((prevActiveStep) => prevActiveStep - 1);
    };

    const handleReset = () => {
      setActiveStep(0);
    };

    if (steps.length == 0) {
      return (
        <div style={{display: "flex", justifyContent: "center", alignItems: "center"}}>
          <CircularProgress />
        </div>
      );
    } else {
      return (
        <div className={classes.root}>
          <Stepper activeStep={activeStep} orientation="vertical">
            {steps.map(({label, content, next, back, actions}, index) => (
              <Step key={index}>
                <StepLabel>{label}</StepLabel>
                <StepContent>
                  <Typography>
                  <span dangerouslySetInnerHTML={{__html:marked(content)}}></span>
                  </Typography>
                  {actions &&
                  <div className={classes.actionsContainer}>
                    <div>
                      {Object.entries(actions).map((o, index) => (
                      <Button
                        key={index}
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
          {steps && (activeStep === steps.length) && (
            <Paper square elevation={0} className={classes.resetContainer}>
              <Typography>Congrats, you&apos;re done!</Typography>
              <Button onClick={handleReset} className={classes.button}>
                Restart
              </Button>
            </Paper>
          )}
        </div>
      );
    }
  }

function Cartouche({children}) {
    return (
    <Paper style={{display: "flex", flex: 1, alignItems: "center"}}>
        <div style={{display: "flex", flex: 1, alignItems: "center", justifyContent: "center", height: "50vh", padding: 20}}>
            {children}
        </div>
    </Paper>
    );
}

function TutorialController({steps, uuid}) {
    return (
      <div style={{display: "flex", flex: 1, alignItems: "center", justifyContent: "center", border: "1px #424242 solid", overflow: "auto"}}>
        <div style={{flex: 1, padding: 20, maxWidth: "300px"}}>
            <VerticalLinearStepper steps={steps} />
        </div>
        <div style={{display: "flex", flex: 2, height: "50vh", padding: 20}}>
            <TheiaInstance uuid={uuid} />
        </div>
      </div>
    );
}

function Media() {
  return (
    <Card style={{width: "30vw", height: "30vh"}}>
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

function login(): void {
  window.location.href = '/api/login/github';
}

export function TutorialPanel({ client, user }) {
    const [instanceUUID, setInstanceUUID] = useState(null);

    useEffect(() => {
        async function fetchData() {
            /*
            const instance = result[0];
            if (instance?.template?.name == template) {
              // TODO handle errors
              setInstanceUUID(instance.instance_uuid);
            }
            TODO
            */
        }

        fetchData();
      }, []);

    async function createInstance(template: string) {
        const {result, error} = await new Client().deployInstance(template);
        if (result) {
          setInstanceUUID(result);
        }
    }

    const specs = createSpecs(new Instance(instanceUUID));
    return (
      <div style={{display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", margin: 20}}>
        <Media />
        <div style={{width: "100%", margin: 40}}>
          {instanceUUID ?
          <TutorialController steps={specs.steps} uuid={instanceUUID} />
          :
          <Cartouche>
              <Container style={{display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center"}}>
                  <Typography>Want to give it a try?</Typography>
                  {user
                  ? <Button onClick={() => createInstance(specs.template)}>GO</Button>
                  : <Button onClick={login}>LOGIN</Button>}
              </Container>
          </Cartouche>
          }
        </div>
        <Media />
      </div>
      );
}
