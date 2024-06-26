<a href="https://discord.gg/WhZmm46APN"><img alt="Discord" src="https://img.shields.io/discord/852538978946383893?style=for-the-badge&logo=discord&label=Discord&labelColor=%231940ED&color=%233FCB9B"></a>

# XRAY/Graph Network Stats — Cloudflare Worker

> [!WARNING]
> **DEPRECATED:** The tool has been moved to XRAY/Graph Output, which is an internal proprietary XRAY project that acts as a load balancer and proxy tool for API access management and documentation in OpenAPI format

XRAY/Graph Network Stats — Statistics of various indicators for Cardano and XRAY

## Getting Started
### Prepare Installation

``` console
git clone \
  --recurse-submodules \
  https://github.com/xray-network/cloudflare-worker-network-stats.git \
  && cd cloudflare-worker-network-stats
```

### Edit [wrangler.toml](https://github.com/xray-network/cloudflare-worker-network-stats/blob/main/wrangler.toml)

```
change KV_STATS id
change KV_OUTPUT_COUNTER id
change KV_OUTPUT_HEALTH id
change KV_TURBO_TX_SEND_COUNTER id
change KV_CDN_COUNTER id
```

### Run Dev Server

```
yarn start
```

### Deploy to Cloudflare Workers

```
yarn deploy
```

## Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | /stats/graph | XRAY \| Graph Statistics |
| GET | /stats/stage1 | Stage 1 Statistics (ISPO, etc) |
| GET | /stats/xray | XRAY \| Network Statistics |
| GET | /stats/circulating-supply | XRAY Token Circulating Supply |
| GET | /stats/total-supply | XRAY Token Total Supply |
| GET | /stats/cardano | Cardano Statistics |
| GET | /stats/git | XRAY Git Development Statistics |
