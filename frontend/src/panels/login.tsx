import React from "react";
import Button from "@material-ui/core/Button";
import GitHubIcon from '@material-ui/icons/GitHub';
import Typography from '@material-ui/core/Typography';
import { CenteredContainer } from "../components";

function login(): void {
    // TODO propagate deploy and files params
    window.location.href = "/api/login/github";
}

export function LoginPanel(): JSX.Element {
    return (
        <CenteredContainer>
            <Typography variant="h3" style= {{ textAlign: "center" }}>
                You must log in to use Playground
            </Typography>
            <Button style={{ marginTop: 40 }} startIcon={<GitHubIcon />} onClick={login} color="primary" variant="contained" disableElevation>LOGIN</Button>
        </CenteredContainer>
    );
}
