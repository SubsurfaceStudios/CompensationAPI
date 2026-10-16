# syntax=docker/dockerfile:1

# Build from source
FROM --platform=$BUILDPLATFORM golang:alpine AS build

ARG TARGETOS
ARG TARGETARCH

WORKDIR /app

RUN --mount=type=bind,target=. GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -o /cvrapi .


# Deploy binary to a lightweight image
FROM gcr.io/distroless/base-debian12 AS build-release-stage

WORKDIR /

COPY --from=build /cvrapi /cvrapi

EXPOSE 8080

USER nonroot:nonroot

ENTRYPOINT [ "/cvrapi" ]