import { Polly, Timing } from '@pollyjs/core';
import FetchAdapter from '@pollyjs/adapter-fetch';

Polly.register(FetchAdapter);

const polly = new Polly('Sign In', {
  adapters: ['fetch'],
  logging: false,
});
const { server } = polly;

let description = `#frdsfd

* dsfds
* dsfdsf

dsfds dsfdsf dsf dsf dsf dsf dsf dsf dsfdsf dsf ds fds fdsf ds fds fds 
dsf dsfds fds  dsfhyrtu ytu ytuy tu tu yrtu ytu ytu ytu ytu ytu ty uyt aa aaa aa aa aa dsf dsfds fds  dsfhyrtu ytu ytuy tu tu yrtu ytu ytu ytu ytu ytu ty uyt aa aaa aa aa aa dsf dsfds fds  dsfhyrtu ytu ytuy tu tu yrtu ytu ytu ytu ytu ytu ty uyt aa aaa aa aa aa

## erez`;
let runtime = {env: [{name: "SOME_ENV", value: "1234"}], ports: [{name: "web", protocol: "TCP", path: "/", port: 123, target: 123}]};
let build = {base: "", extensions: [{name: "", value: ""}], repositories: [{name: "", value: ""}], commands: [{name: "", run: "", working_directory: ""}]};
let template = {image: "gcr.io/substrateplayground-252112/jeluard/theia-substrate@sha256:0b3ec9ad567d0f5b0eed8a0fc2b1fa3fe1cca24cc02416047d71f83770b05e34", name: "workshop", description: description, runtime: runtime, build: build}
let instance = {user_uuid: "", instance_uuid: "", template: template, phase: "starting", url: "", started_at: {secs_since_epoch: 1588254730}};

export function intercept({noInstance = true, delay = 100}: {noInstance?: boolean, delay?: number}) {
  server.get('/api/templates').intercept(async (req, res) => {
    await server.timeout(delay);
    res.status(200).json({
      result: [template],
    });
  });
  server.get('/theia').intercept(async (req, res) => {
    await server.timeout(delay);
    res.status(200);
  });
  server.get('/api/:uuuid/:iuuid').intercept(async (req, res) => {
    await server.timeout(delay);
    res.status(200).json({
      result: {phase: "Running", url: "http://www.google.fr"},
    });
  });
  server.get('/api/:uuuid').intercept(async (req, res) => {
    await server.timeout(delay);
    res.status(200).json({
      result: noInstance ? [] : [instance],
    });
  });
  server.post('/api/:uuid?template=:template').intercept(async (req, res) => {
    await server.timeout(delay);
    res.status(200).json({
      result: "uuid",
    });
  });
}