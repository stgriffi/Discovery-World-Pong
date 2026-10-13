# This dockerfile was quickly made to dockerize the application it has not been optimized.
ARG CERTS=default

FROM --platform=amd64 ubuntu:22.04 AS ssl_default

FROM ssl_default AS ssl_zscaler
COPY --from=certs . ./certs
RUN apt-get update -y && apt-get upgrade -y && apt-get install -y ca-certificates
RUN cp ./certs/zscaler.crt /usr/local/share/ca-certificates/
RUN update-ca-certificates
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

# This build only works on amd64 platforms,
# other platforms can emulate this if needed
FROM ssl_${CERTS} AS builder
ENV PYTHONDONTWRITEBYTECODE=1
RUN apt-get update --fix-missing && apt-get upgrade -y
RUN apt-get install curl sudo lsb-base lsb-release -y
ENV DEBIAN_FRONTEND=noninteractive
RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections
RUN sudo apt-get install software-properties-common -y
RUN sudo add-apt-repository ppa:deadsnakes/ppa
RUN sudo apt-cache policy python3.9
RUN sudo apt-get install python3.9 -y
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.9 1
RUN sudo apt-get install python3.9-dev python3.9-distutils python3.9-venv pkg-config libcairo2-dev gcc libdbus-1-3 libdbus-1-dev libgirepository1.0-dev -y
RUN python -m ensurepip && python -m ensurepip --upgrade
WORKDIR /app
# COPY --from=util . ./shared
COPY requirements.txt .
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN python -m pip install --upgrade pip && python -m pip install --no-compile --no-cache-dir -r requirements.txt 
COPY --from=util ./py_packages ./py_packages
COPY --from=util ./schema .
COPY --from=util ./schema ./py_packages/dw/state_machine
COPY requirements.txt .
RUN python3 -m pip install --upgrade pip && python3 -m pip install --no-cache-dir -r requirements.txt 
RUN python -m pip install --upgrade build
RUN python -m build py_packages
RUN python -m pip install ./py_packages/dist/dw-0.2.0-py3-none-any.whl

FROM ssl_${CERTS} AS final

LABEL org.opencontainers.image.source=https://github.com/aaron97neu/Discovery-World-Pong
LABEL org.opencontainers.image.licenses=MIT

RUN apt-get update --fix-missing && apt-get upgrade -y

RUN apt-get install curl sudo lsb-base lsb-release -y
ENV DEBIAN_FRONTEND=noninteractive
RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections
RUN sudo apt-get install software-properties-common -y
RUN sudo add-apt-repository ppa:deadsnakes/ppa
RUN sudo apt-cache policy python3.9
RUN sudo apt-get install python3.9 -y
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.9 1
RUN sudo apt-get install python3.9-distutils -y
RUN apt-get install ffmpeg libsm6 libxext6 -y
# RealSense apt repo per https://github.com/realsenseai/librealsense/blob/master/doc/distribution_linux.md
# (the librealsense.intel.com repo is now signed with a RealSense key its old .pgp file doesn't contain).
RUN sudo mkdir -p /etc/apt/keyrings
RUN curl -sSf https://librealsense.realsenseai.com/Debian/librealsenseai.asc | gpg --dearmor | sudo tee /etc/apt/keyrings/librealsenseai.gpg > /dev/null
RUN sudo apt-get install apt-transport-https -y
RUN echo "deb [signed-by=/etc/apt/keyrings/librealsenseai.gpg] https://librealsense.realsenseai.com/Debian/apt-repo `lsb_release -cs` main" | sudo tee /etc/apt/sources.list.d/librealsense.list
RUN sudo apt-get update --fix-missing
RUN sudo apt-get install -y librealsense2-utils

WORKDIR /app
COPY --from=builder /app .
COPY --from=builder /opt/venv /opt/venv
COPY . .
ENV PATH="/opt/venv/bin:$PATH"
CMD ["python", "src/motion_driver.py"]
