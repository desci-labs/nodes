FROM ubuntu:latest AS builder

WORKDIR /workdir

RUN apt-get update && apt-get install -y curl dpkg

RUN ARCH="$(dpkg --print-architecture)" && echo "${ARCH}"

RUN if [ "$(dpkg --print-architecture)" = "amd64" ]; then curl -LO https://github.com/cloudflare/workerd/releases/download/v1.20241112.0/workerd-linux-64.gz; fi
RUN if [ "$(dpkg --print-architecture)" = "arm64" ]; then curl -LO https://github.com/cloudflare/workerd/releases/download/v1.20241112.0/workerd-linux-arm64.gz; fi


RUN ls -la && gunzip workerd*.gz && mv workerd* workerd && chmod +x workerd

RUN mkdir lib && \
    cp /lib/*-linux-gnu/libdl.so.2 lib/libdl.so.2 && \
    cp /lib/*-linux-gnu/librt.so.1 lib/librt.so.1

FROM busybox:glibc

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /workdir/workerd /workerd
COPY --from=builder /workdir/lib /lib

WORKDIR /worker

ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

ENTRYPOINT [ "/workerd" ]

CMD [ "serve", "--experimental", "--binary", "worker.capnp" ]
