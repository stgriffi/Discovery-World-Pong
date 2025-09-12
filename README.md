# Discovery World Pong
This repository contains the code behind the Rockwell Automation "Pong" exhibit at the Discovery World Museum in Milwaukee, WI

An overview of this repo's history and goals can be found in the [vision.md](/docs/API/overview/vision.md) document.

# Contributing
See [Contributing.md](/docs/CONTRIBUTING.md)

# Development
## Dependencies
Docker (and Docker Compose) are required to build the containers.
Other OCI compliant runtimes like Podman should work.
To run the exhibit, an Intel Realsense 435 camera and drivers is required.
See [post-install.sh](setup/post-install.sh) for a full exhibit setup script from a vanilla Ubuntu install.

## Building
The docker compose file provides profiles to select the containers appropiate
for a specific use case.

- **prod:** Build only the containers used on the exhibit.
    - Example: `docker compose --profile prod up`
- **dev:** Build additional development containers including a mqtt gui and a 
           single screen containing all exhibit screens
    - When using dev, you _must_ select the top and bottom players as well.
            To match the exhibit, use profiles `top-player-ai-gpu` and 
            `bottom-player-depth` as such: `docker compose --profile dev 
            --profile top-player-ai-gpu --profile bottom-player-depth up`. 
            The following 'players' are available:
        - `top-player-ai-gpu` This is the AI player used in the exhibit. Expects
            an Nvidia GPU and appropiate docker configuration with Nvidia
            container toolkit.
        - `top-player-ai-cpu` The exact same AI player used in the exhibit, but
            configured to expect to use CPU inferencing rather than GPU. Very
            CPU intesive.
        - `bottom-player-depth` The 'human player' used in the exhibit. Uses
            an Intel Realsense depth camera to detect the human player and move
            the paddle accordingly.
        - `top-player-web` debugging controller that gives left and right
            buttons to click on the move the top paddle. Access via 
            `localhost:5004`.
        - `bottom-player-web` debugging controller that gives left and right
            buttons to click on the move the bottom paddle. Access via 
            `localhost:5005`.

Rockwell Automation requires all machines (incl containers) to have a ZScaler
SSL certificate installed in order to connect to the internet. These containers
support this and will install the certs with the build argument `CERTS=zscaler`
as shown below. Without this arguement, the certificates will not be installed.
```
docker compose --profile prod up --build-arg CERTS=zscaler
```

### Tags
The latest `reslease/x.y.z` tag is the most recent stable version. 
The `latest` tag is not used.
Maintainers should always be specifying a version when pulling, and if a maintainer truely needs
"the latest version", `next` better communicates that it is the bleeding edge.

The CI/CD system will automatically build and push containers for all `main` and PR commits.
All proposed code should be built in the same way that the final code is built so that any 
discrepancies in the build environment between developer machines and the release built system are 
accounted for.
In addition, this facilitates easier testing by pulling from the registry instead of building. 
This allows developers to test proposed code an exhibit twin (or any other suitable test system) by
just pulling from the compose instead of pulling the source in rebuilding, and removes any potential
issues with local build system.
Finally, in an emergency, the exhibit itself can use proposed code from any published commit while a
hotfix is deployed to the main codebase.

### Start/stop the exhibit using docker-compose
To start the containers using docker-compose run the following:
```
docker compose --profile prod up -d
```
To stop the containers using docker-compose run the following:
```
docker compose --profile prod down
```

To open each GUI window in their positions used in the exhibit, run the following:
```
./setup/open_windows.sh
```
Keep in mind that unless the machine has its monitors configured similarly to the exhibit, the behavior is undefined.
To manually open the windows, open an internet browser to the following sites:
#### Gameboard
[http://localhost:5000](http://localhost:5000)
#### Human Visualizer (Depth Camera Heatmap)
[http://localhost:5001](http://localhost:5001)
##### Neural Network Visualizer
[http://localhost:5002](http://localhost:5002)
##### Clocktower Visualizer
[http://localhost:5003](http://localhost:5003)
##### Top Player Web Paddle
[http://localhost:5004](http://localhost:5004)
##### Bottom Player Web Paddle
[http://localhost:5005](http://localhost:5005)

To close all GUI windows, run the following
```
./setup/close_windows.sh
```


### MQTT Messaging
![MQTT Messaging Diagram](/docs/assets/mqtt_messaging_diagram.png "MQTT Messaging Diagram")