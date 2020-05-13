class Discoverer {

    #channel = new BroadcastChannel("paritytech#playground-instance");

    constructor() {
        this.#channel.onmessage = (o) => {

        };
        this.#channel.onmessageerror = (o) => {
            
        };
    }

    onInstanceDiscovered
    onInstanceStopped

    next(): Instance {

    }

    close() {
        this.#channel.close()
    }

}

class Instance {

    details() {

    }

    send(action, ..value) {

    }

}

// Instance side


class Listener {

    discoveryChannel = new BroadcastChannel("paritytech#playground-instance");
    discoveryChannel.onmessage = (o) -> {
        const channelId = "someUniqueId";
        channel = new BroadcastChannel(channelId);
        discoveryChannel.onmessage = (o) -> {
            // extract command, .. from message and execute
        }
        channel.postMessage(new InstanceDetails(channelId))
    };
    discoveryChannel.onmessageerror = (o) -> {
        
    };

    close() {
        discoveryChannel.close()
        // close all individual channels
    }

}