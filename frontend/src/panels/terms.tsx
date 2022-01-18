import marked from 'marked';
import React, { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { CenteredContainer } from '../components';

function TermsDialog({ terms, show, onHide, onTermsApproved }: { terms: string, show: boolean, onHide: () => void, onTermsApproved: () => void }): JSX.Element {
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

export function TermsPanel({ terms, onTermsApproved }: { terms: string, onTermsApproved: () => void }): JSX.Element {
    const [showTerms, setTermsVisible] = useState(false);
    return (
        <CenteredContainer>
            <Typography variant="h3" style= {{ textAlign: "center" }}>
                Please review terms before continuing
            </Typography>
            <TermsDialog terms={terms} show={showTerms} onTermsApproved={onTermsApproved} onHide={() => setTermsVisible(false)} />
            <Button onClick={() => setTermsVisible(true)}>Show terms</Button>
        </CenteredContainer>
    );
}
