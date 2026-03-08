FROM node:20-alpine

RUN apk add --no-cache bash docker-cli git

WORKDIR /workspace

CMD ["node", "vm-deploy/ops-agent.mjs"]
