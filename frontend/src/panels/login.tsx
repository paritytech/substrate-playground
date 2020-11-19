import crypto from 'crypto';
import marked from 'marked';
import React, { useState } from "react";
import Button from "@material-ui/core/Button";
import Container from "@material-ui/core/Container";
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import GitHubIcon from '@material-ui/icons/GitHub';
import Typography from '@material-ui/core/Typography';
import { useLocalStorage } from '../hooks';

import terms from 'bundle-text:../terms.md';

const termsHash = crypto.createHash('md5').update(terms).digest('hex');

function login(): void {
    localStorage.setItem('login', "true");
    window.location.href = "/api/login/github";
}

function Terms({ show, set, hide }) {
    return (
    <Dialog open={show} maxWidth="md">
        <DialogTitle>Terms</DialogTitle>
        <DialogContent>
            <DialogContentText id="alert-dialog-description">
                <span dangerouslySetInnerHTML={{__html:marked(terms)}}></span>
            </DialogContentText>
            <Button onClick={() => {set(); hide();}}>ACCEPT</Button>
            <Button onClick={hide}>CLOSE</Button>
        </DialogContent>
    </Dialog>);
}

export function LoginPanel() {
    const [previousTermsHash, setTermsHash] = useLocalStorage('termsApproved', "");
    const [showTerms, setVisibleTerms] = useState(false);
    const termsApproved = previousTermsHash == termsHash;
    return (
    <Container style={{display: "flex", flex: 1, padding: 0, alignItems: "center", justifyContent: "center", flexDirection: "column"}}>
        <Typography variant="h3" style= {{ textAlign: "center" }}>
            You must log in to use Playground
        </Typography>
        <Terms show={showTerms} set={() => setTermsHash(termsHash)} hide={() => setVisibleTerms(false)} />
        {termsApproved
        ?<Button style={{ marginTop: 40 }} startIcon={<GitHubIcon />} onClick={login} color="primary" variant="contained" disableElevation disabled={!termsApproved}>LOGIN</Button>
        :<Button onClick={() => setVisibleTerms(true)}>Show terms</Button>}
    </Container>);
}