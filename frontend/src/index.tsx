import React, { useState, useEffect } from "react";
import * as ReactDOM from "react-dom";
import 'typeface-roboto';
import Button from '@material-ui/core/Button';
import CircularProgress from '@material-ui/core/CircularProgress';
import Typography from '@material-ui/core/Typography';
import * as templates from './templates.json';
import substrate_placeholder from './assets/substrate-placeholder.png';

async function deployDocker(template: string) {
    const response = await fetch(`/api/new?template=${template}`, {
        method: 'GET',
        headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
        }
      });
      if (response.status == 200) {
        return await response.json();
      } else {
        return {"reason": response.statusText};
      }
}

async function getDeployment(uuid: string) {
    const response = await fetch(`/api/url?id=${uuid}`, {
        method: 'GET',
        headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
        }
      });
      if (response.status == 200) {
        return await response.json();
      } else {
          return {"reason": response.statusText};
      }
}

async function deployAndRedirect(setError: (error: string) => void, template: string) {
    const result = await deployDocker(template);
    if (result && result.status === "ok") {
        const id = result.id;
        if (!!id) {
            // Drop existing query parameters
            window.history.replaceState(null, "", window.location.pathname);
            document.location.search = "?uuid=" + id;
        } else {
            setError("Missing id in returned response");
        }
    } else {
        setError(result.reason);
    }
}

function App() {
    const [url, setURL] = useState(undefined);
    const [error, setError] = useState(undefined);

    const uuid = new URLSearchParams(window.location.search).get("uuid");

    if (uuid) {
        const id = setInterval(async () => {
            const result = await getDeployment(uuid);
            if (result.status == "pending") {
                return;
            } else if (result.status == "ko") {
                setError(result.reason);
            }
            clearInterval(id);
            const url = result.URL;
            if (url) {
                setURL(url);
            }
        }, 1000);
        if (url) {
            return (
                <div>
                  <iframe src={url} onError={() => setError("Failed to load theia")} frameBorder="0" style={{overflow:"hidden",height:"100vh",width:"100vm"}} height="100%" width="100%"></iframe>
                </div>)
        } else {
            return (
                <div style={{display: "flex", justifyContent: "center", alignItems: "center", height: "100vh"}}>
                    <div style={{display: "flex", justifyContent: "center", alignItems: "center", flexDirection: "column"}}>
                        <Typography variant="h3" component="h2">
                        Forking
                        </Typography>
                        <CircularProgress />
                    </div>
                </div>)
        }
    }  else {
        // Landing page
        return (
            <div style={{display: "flex", justifyContent: "center", alignItems: "center", height: "100vh"}}>
                {error == null && templates.data.map((item, key) =>
                    <div key={item.id} style={{"display": "flex", "flexDirection": "column" , "alignItems": "center", "margin": "10px"}}>
                        <Typography variant="h5">{item.name}</Typography> 
                        <img src={substrate_placeholder} style={{"width": "100px"}} />
                        <Button style={{marginTop: "20px"}} variant="contained" color="primary" onClick={() => deployAndRedirect(setError, item.id)}>
                            Deploy
                        </Button>
                    </div>
                )}
                {error &&
                    <div style={{"display": "flex", "flexDirection": "column" , "alignItems": "center", "margin": "10px"}}>Error during deployment: {error}</div>
                }
            </div>)
    }
}

ReactDOM.render(
    <App />,
    document.getElementById("root")
);
