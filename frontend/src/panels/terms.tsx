import marked from 'marked';
import React, { useState } from "react";
import Button from "@material-ui/core/Button";
import Container from "@material-ui/core/Container";
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import Typography from '@material-ui/core/Typography';

function TermsDialog({ terms, show, onHide, onTermsApproved }) {
    return (
    <Dialog open={show} maxWidth="md">
        <DialogTitle>Terms</DialogTitle>
        <DialogContent>
            <DialogContentText id="alert-dialog-description">
                <span dangerouslySetInnerHTML={{__html:marked(terms)}}></span>
            </DialogContentText>
            <Button onClick={() => {onTermsApproved(); onHide();}}>ACCEPT</Button>
            <Button onClick={onHide}>CLOSE</Button>
        </DialogContent>
    </Dialog>);
}

export function TermsPanel({ terms, onTermsApproved }: { terms: string, onTermsApproved: () => void }) {
    const [showTerms, setTermsVisible] = useState(false);
    return (
        <Container style={{display: "flex", flex: 1, padding: 0, alignItems: "center", justifyContent: "center", flexDirection: "column"}}>
            <Typography variant="h3" style= {{ textAlign: "center" }}>
                Please review terms before continuing
            </Typography>
            <TermsDialog terms={terms} show={showTerms} onTermsApproved={onTermsApproved} onHide={() => setTermsVisible(false)} />
            <Button onClick={() => setTermsVisible(true)}>Show terms</Button>
        </Container>
    );
}