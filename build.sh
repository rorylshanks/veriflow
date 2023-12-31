#!/bin/bash
docker buildx create --use --name multi --platform linux/arm64,linux/amd64
docker buildx build \
  --platform linux/arm64,linux/amd64 \
  -t rorylshanks/veriflow:latest \
  --push \
  -f Dockerfile \
  .
docker buildx rm multi

