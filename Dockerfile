# syntax=docker/dockerfile:1

# Build from source
FROM golang:1.27 AS build

WORKDIR /app

RUN --mount=type=bind,target=. go build -o /cvrapi .


# Deploy binary to a lightweight image
FROM gcr.io/distroless/base-debian12 AS build-release-stage

WORKDIR /

COPY --from=build /cvrapi /cvrapi

EXPOSE 8080

USER nonroot:nonroot

ENTRYPOINT [ "/cvrapi" ]