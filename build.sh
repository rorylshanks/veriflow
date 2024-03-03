#!/bin/bash
docker buildx build \
  --platform linux/arm64,linux/amd64 \
  -t rorylshanks/veriflow:debug \
  --push \
  -f Dockerfile \
  .

