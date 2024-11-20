# FROM jacoblincool/workerd:latest

# COPY ./worker.capnp ./worker.capnp

# CMD ["serve", "worker.capnp"]

FROM ubuntu:latest AS builder

# ARG WORKERD_VERSION
# ARG TARGETARCH

WORKDIR /workdir

RUN apt-get update && apt-get install -y curl ca-certificates

# RUN if [ ${TARGETARCH} = "amd64" ]; then curl -LO https://github.com/cloudflare/workerd/releases/download/${WORKERD_VERSION}/workerd-linux-64.gz; fi
# RUN if [ ${TARGETARCH} = "arm64" ]; then curl -LO https://github.com/cloudflare/workerd/releases/download/${WORKERD_VERSION}/workerd-linux-arm64.gz; fi

RUN curl -LO https://github.com/cloudflare/workerd/releases/download/v1.20241112.0/workerd-linux-arm64.gz

RUN ls -la && gunzip workerd*.gz && mv workerd* workerd && chmod +x workerd

RUN mkdir lib && \
    cp /lib/*-linux-gnu/libdl.so.2 lib/libdl.so.2 && \
    cp /lib/*-linux-gnu/librt.so.1 lib/librt.so.1

FROM busybox:glibc

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /workdir/workerd /workerd
COPY --from=builder /workdir/lib /lib

WORKDIR /worker

COPY .  . 
COPY worker.capnp worker.capnp

ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

ENTRYPOINT [ "/workerd" ]

CMD [ "serve", "worker.capnp" ]