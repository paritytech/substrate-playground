import React, { useEffect, useState } from "react";
import Button from '@material-ui/core/Button';
import Checkbox from '@material-ui/core/Checkbox';
import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import Typography from '@material-ui/core/Typography';
import { startNode, gotoLine, cursorMove } from "../commands";
import { Discoverer, Instance } from "../connect";

function useDiscovery() {
    const [instances, setInstances] = useState([]);

    useEffect(() => {
        const refresher = (_) => setInstances(Array.from(discoverer.instances.entries()));
        const discoverer = new Discoverer(refresher, refresher);
        return () => discoverer.close();
    }, []);

    return instances;
}

function InstanceController({ instances }) {
    const [selectedInstance, setInstance] = useState(null);
    const [commands, setCommands] = useState(null);
    const [command, setCommand] = useState(null);
    const [result, setResult] = useState(null);

    useEffect(() => {
        const onlyInstance = instances.length == 1 ? instances[0] : null;
        if (onlyInstance) {
            selectInstance(onlyInstance[1]);
        }
    }, [instances]);

    async function selectInstance(instance: Instance): void {
        setInstance(instance);
        const commands = await instance.list();
        setCommands(commands);
    }

    async function executeCommand(instance: Instance, command: string, data = {}) {
        try {
            const result = await instance.execute(command, data);
            setResult(result);
        } catch (error) {
            console.error(error);
        }
    }

    const handleChange = (event: React.ChangeEvent<{ value: unknown }>) => {
        setCommand(event.target.value as string);
    };

    if (instances.length > 0) {
    return (
    <div style={{flex: 1, display: "flex", flexDirection: "column", alignItems: "center", margin: 20}}>
        {selectedInstance &&
        <Typography variant="h6">
            Instance #{selectedInstance.uuid}
        </Typography>
        }
        {(instances && !selectedInstance) &&
        <ul>
        {instances.map((value, index) => {
            return (
                <li key={index}>
                    <div>{value[0]}</div>
                    <Checkbox checked={selectedInstance?.uuid == value[0]} onChange={async () => await selectInstance(value[1])}></Checkbox>
                </li>
            );
        })}
        </ul>
        }
        {commands &&
        <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", margin: 20}}>
            <FormControl style={{minWidth: 120}}>
                <InputLabel id="commands">Commands</InputLabel>
                <Select
                labelId="commands"
                value={command}
                onChange={handleChange}
                >
                {commands.filter(({id, label}) => id && label && label != "").map(({id, label}, index) =>
                     <MenuItem key={id} value={id}>{label}</MenuItem>
                )}
                            </Select>
                        </FormControl>
                        <Button style={{ marginLeft: 40 }} color="primary" variant="contained" disableElevation onClick={() => executeCommand(selectedInstance, command)}>EXECUTE</Button>
                    </div>
                }
                {selectedInstance &&
                    <>
                        <Button style={{ marginTop: 10 }} color="primary" variant="contained" disableElevation onClick={() => startNode(selectedInstance)}>START NODE</Button>
                        <div style={{ marginTop: 10 }}>
                            <Button color="primary" variant="contained" disableElevation onClick={() => gotoLine(selectedInstance)}>GOTO LINE</Button>
                        </div>
                        <div style={{ marginTop: 10 }}>
                            <Button color="primary" variant="contained" disableElevation onClick={() => cursorMove(selectedInstance)}>CURSOR MOVE</Button>
                        </div>
                    </>}
            </div>
        );
    } else {
        return (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Typography variant="h6">
                    No instance detected
                </Typography>
            </div>
        );
    }
}
