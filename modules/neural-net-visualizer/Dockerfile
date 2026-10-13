ARG CERTS=default

FROM python:3.8-slim-bookworm AS ssl_default

FROM ssl_default AS ssl_zscaler
COPY --from=certs . ./certs
RUN apt-get update -y && apt-get upgrade -y && apt-get install -y ca-certificates
RUN cp ./certs/zscaler.crt /usr/local/share/ca-certificates/
RUN update-ca-certificates
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

# This dockerfile was quickly made to dockerize the application it has not been optimized.
FROM ssl_${CERTS} AS builder

ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN python -m pip install --upgrade pip && python -m pip install --no-compile --no-cache-dir -r requirements.txt

# Draw the networks TYLER actually plays with: export the AI's model files (dw Config.AI_MODELS).
COPY --from=util ./py_packages/dw/config.py ./dw_config.py
COPY --from=util ./validation ./validation
COPY export_weights.py .
RUN python export_weights.py dw_config.py validation models

FROM ssl_${CERTS} AS final

LABEL org.opencontainers.image.source=https://github.com/aaron97neu/Discovery-World-Pong
LABEL org.opencontainers.image.licenses=MIT

WORKDIR /app

# The page server (visualization_driver.py) only needs the standard library.
COPY . .
COPY --from=builder /app/models visualizer/models/

CMD ["python", "visualization_driver.py"]


