import React from "react";
import Button from "@material-ui/core/Button";
import Container from "@material-ui/core/Container";
import GitHubIcon from '@material-ui/icons/GitHub';
import Typography from '@material-ui/core/Typography';

function login(): void {
    localStorage.setItem('login', "true");
    window.location.href = "/api/login/github";
}

export function LoginPanel() {
    return (
        <Container style={{display: "flex", flex: 1, padding: 0, alignItems: "center", justifyContent: "center", flexDirection: "column"}}>
            <Typography variant="h3" style= {{ textAlign: "center" }}>
                You must log in to use Playground
            </Typography>
            <Button style={{ marginTop: 40 }} startIcon={<GitHubIcon />} onClick={login} color="primary" variant="contained" disableElevation>LOGIN</Button>
        </Container>
    );
}