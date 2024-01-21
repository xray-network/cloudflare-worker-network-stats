/**
 * @@ XRAY NETWORK | Graph | Network Stats
 * Statistics of various indicators for Cardano and XRAY
 * Learn more at https://developers.cloudflare.com/workers/
 */

import * as Types from "./types"
import jsonIspoDrop from "./ispo_drop.json"
import jsonIspoHistory from "./ispo_history.json"

const API_GROUP = "stats"
const API_TYPES: Types.StatsType[] = ["graph", "stage1", "xray", "circulating-supply", "cardano", "git"]
const ALLOWED_METHODS = ["GET", "POST", "OPTIONS", "HEAD"]
const API_KOIOS = `https://service-binding/output/koios/mainnet/api/v1` // https://koios.rest can be used also

export default {
  // Main fetch handler
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { segments, pathname, search } = getUrlSegments(new URL(request.url))
    const [group, __type] = segments
    const type = __type as Types.StatsType

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": ALLOWED_METHODS.join(", "),
          "Access-Control-Max-Age": "86400",
          "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept",
        },
      })
    }

    if (!ALLOWED_METHODS.includes(request.method)) return throw405()
    if (group !== API_GROUP) return throw404()
    if (!API_TYPES.includes(type)) return throw404()

    /**
     * XRAY | Graph statistics
     */

    try {
      if (type === "graph") {
        const outputHealth = JSON.parse((await env.KV_OUTPUT_HEALTH.get("status")) || "{}")
        outputHealth?.status?.forEach((item: any, index: number) => {
          item.host = `server${index}`
        })
        const outputCounter = JSON.parse((await env.KV_STATS.get("outputCounter")) || "{}")
        const turboTxSendStats = JSON.parse((await env.KV_STATS.get("turboTxSend")) || "{}")
        const cdnCounter = Number((await env.KV_CDN_COUNTER.get("counter")) || 0)
        return addCorsHeaders(
          addContentTypeJSONHeaders(
            new Response(
              JSON.stringify({
                output: {
                  health: outputHealth,
                  counter: outputCounter,
                },
                turbo_tx_send: turboTxSendStats,
                cdn: {
                  counter: cdnCounter,
                },
              })
            )
          )
        )
      }

      /**
       * ISPO Stage1 statistics
       */

      if (type === "stage1") {
        return addCorsHeaders(
          addContentTypeJSONHeaders(
            new Response(
              JSON.stringify({
                participants: 26087,
                max_tvl: 265841222,
                max_rate: 525.31458,
                xdiamond: 15868,
                xray: 183777555,
                withdrawal_details: jsonIspoDrop,
                epoch_history: jsonIspoHistory.epoch_history,
                stake_history: jsonIspoHistory.stake_history,
              })
            )
          )
        )
      }

      /**
       * XRAY tokens statistics
       */

      if (type === "xray") {
        const xrayStats = JSON.parse((await env.KV_STATS.get("xray")) || "{}")
        return addCorsHeaders(addContentTypeJSONHeaders(new Response(JSON.stringify(xrayStats))))
      }

      /**
       * XRAY circulating supply endpoint for CMC
       */

      if (type === "circulating-supply") {
        const [policyId, assetName] = ["86abe45be4d8fb2e8f28e8047d17d0ba5592f2a6c8c452fc88c2c143", "58524159"]
        const rewardsAddress = await env.OUTPUT_LOAD_BALANCER.fetch(`${API_KOIOS}/address_assets`, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            _addresses: [
              "addr1qyc98ysmvxunqslu3y5t9gpt2mm8dp3puylpq7n5n908jldw8w6w5nmvw86ullauxldxdjsfauyrattxw6yevxp72nnsq3lt0u",
            ],
          }),
        })
        const rewardsAddressData: any = (await rewardsAddress.json()) as any
        const totalSupply = 324922240000000
        const incentiveSupply =
          Number(
            rewardsAddressData?.find((asset: any) => asset.policy_id === policyId && asset.asset_name === assetName)
              ?.quantity
          ) || 0
        const circulatingSupply = (totalSupply - incentiveSupply) / 1000000
        return addCorsHeaders(new Response(circulatingSupply.toString()))
      }

      /**
       * Cardano blockchain statistics
       */

      if (type === "cardano") {
        const requests = [
          env.OUTPUT_LOAD_BALANCER.fetch(`${API_KOIOS}/totals`, {
            headers: {
              accept: "application/json",
              "content-type": "application/json",
            },
          }),
          env.OUTPUT_LOAD_BALANCER.fetch(
            `${API_KOIOS}/epoch_info?limit=1&order=epoch_no.desc&_include_next_epoch=true`,
            {
              headers: {
                accept: "application/json",
                "content-type": "application/json",
              },
            }
          ),
          env.OUTPUT_LOAD_BALANCER.fetch(`${API_KOIOS}/tip`, {
            headers: {
              accept: "application/json",
              "content-type": "application/json",
            },
          }),
        ]
        const [networkTotals, epochInfo, tip] = await Promise.all(requests)
        const networkTotalsData = ((await networkTotals.json()) as any)?.[0]
        const epochInfoData: any = ((await epochInfo.json()) as any)?.[0]
        const tipData: any = ((await tip.json()) as any)?.[0]
        return addCorsHeaders(
          addContentTypeJSONHeaders(
            new Response(
              JSON.stringify({
                network: networkTotalsData,
                epoch: epochInfoData,
                tip: tipData,
              })
            )
          )
        )
      }

      /**
       * GitHub commits monitoring
       */

      if (type === "git") {
        const gitStats = JSON.parse((await env.KV_STATS.get("git")) || "[]")
        return addCorsHeaders(addContentTypeJSONHeaders(new Response(JSON.stringify(gitStats))))
      }

      return throw404()
    } catch (error) {
      console.log(error)
      return throw500()
    }
  },

  // Crons handler
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const delayedProcessing = async () => {
      // Every 15 minutes
      if (event.cron === "*/15 * * * *") {
        await cacheOutputStats(env)
        await cacheTurboTxSendStats(env)
      }
      // Every 1 hour at 0 minute
      if (event.cron === "0 * * * *") {
        await cacheXRAYStats(env)
        await cacheGitStats(env)
      }
    }
    ctx.waitUntil(delayedProcessing())
  },
}

const cacheOutputStats = async (env: Env) => {
  const outputCounterValues = await getAllKVValues(env.KV_OUTPUT_COUNTER)
  const outputCounter = outputCounterValues.reduce(
    (acc, { key, value }) => {
      const [service, network] = key.split("::")
      acc.service[service] = (acc.service[service] || 0) + Number(value)
      acc.network[network] = (acc.network[network] || 0) + Number(value)
      acc.total = acc.total + Number(value)
      return acc
    },
    {
      service: {},
      network: {},
      total: 0,
    } as any
  )
  await env.KV_STATS.put(
    "outputCounter",
    JSON.stringify(outputCounter)
  )
}

const cacheTurboTxSendStats = async (env: Env) => {
  const turboTxSendValues = await getAllKVValues(env.KV_TURBO_TX_SEND_COUNTER)
  const turboTxSendCounter = turboTxSendValues.reduce(
    (acc, { key, value }) => {
      const [network, status] = key.split("::")
      acc.network[network] = (acc.network[network] || 0) + Number(value)
      acc.status[status] = (acc.status[status] || 0) + Number(value)
      acc.total = acc.total + Number(value)
      return acc
    },
    {
      network: {},
      status: {},
      total: 0,
    } as any
  )
  await env.KV_STATS.put("turboTxSend", JSON.stringify(turboTxSendCounter))
}

const cacheXRAYStats = async (env: Env) => {
  const [policyId, assetName] = ["86abe45be4d8fb2e8f28e8047d17d0ba5592f2a6c8c452fc88c2c143", "58524159"]
  const requests = [
    env.OUTPUT_LOAD_BALANCER.fetch(`${API_KOIOS}/asset_summary?_asset_policy=${policyId}&_asset_name=${assetName}`, {
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
    }),
    env.OUTPUT_LOAD_BALANCER.fetch(`${API_KOIOS}/asset_info`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ _asset_list: [[policyId, assetName]] }),
    }),
    env.OUTPUT_LOAD_BALANCER.fetch(`${API_KOIOS}/address_assets`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        _addresses: [
          "addr1qyc98ysmvxunqslu3y5t9gpt2mm8dp3puylpq7n5n908jldw8w6w5nmvw86ullauxldxdjsfauyrattxw6yevxp72nnsq3lt0u",
        ],
      }),
    }),
    env.OUTPUT_LOAD_BALANCER.fetch(`${API_KOIOS}/address_assets`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        _addresses: [
          "addr1qx6ndpw2uma2qytf2zynvv4crqdwkmck0a2r4vm20gwkzercd5kvnadmwssrwpce6x4c2rm7t6aj3rlkfh2f775fu7fqsdyray",
        ],
      }),
    }),
  ]

  const [assetSummary, assetInfo, incentiveAddress, devAddress] = await Promise.all(requests)
  const assetSummaryData = ((await assetSummary.json()) as any)?.[0]
  const assetInfoData: any = ((await assetInfo.json()) as any)?.[0]
  const incentiveAddressData: any = (await incentiveAddress.json()) as any
  const devAddressData: any = (await devAddress.json()) as any

  if (assetSummaryData && assetInfoData && incentiveAddressData && devAddressData) {
    const totalSupply = Number(assetInfoData.total_supply) || 0
    const incentiveSupply =
      Number(
        incentiveAddressData.find((asset: any) => asset.policy_id === policyId && asset.asset_name === assetName)
          ?.quantity
      ) || 0
    const devSupply =
      Number(
        devAddressData.find((asset: any) => asset.policy_id === policyId && asset.asset_name === assetName)
          ?.quantity
      ) || 0

    const stats = {
      fingerprint: assetInfoData.fingerprint,
      policy_id: assetInfoData.policy_id,
      asset_name: assetInfoData.asset_name,
      asset_name_sscii: assetInfoData.asset_name_ascii,
      decimals: 6,
      minting_tx_hash: assetInfoData.minting_tx_hash,
      total_supply: totalSupply / 1000000,
      incentive_supply: incentiveSupply,
      circulating_supply: (totalSupply - incentiveSupply) / 1000000,
      circulating_supply_pct: (totalSupply - incentiveSupply) / totalSupply * 100,
      creation_time: assetInfoData.creation_time,
      total_transactions: assetSummaryData.total_transactions,
      wallets_staked: assetSummaryData.staked_wallets,
      wallets_unstaked: assetSummaryData.unstaked_addresses,
      wallets_addresses: assetSummaryData.addresses,
      tokenomics: {
        stage1: 183777555,
        stage1_distributed: 183777555,
        stage1_distributed_pct: 100,
        stage1_withdrawn_by_users: 91216511,
        stage1_dropped: 92561044,
        stage2: 50145921,
        stage2_distributed: (50145921000000 - incentiveSupply) / 1000000,
        stage2_distributed_pct: (1 - incentiveSupply / 50145921000000) * 100,
        dev_fund: 58506540,
        dev_fund_left: devSupply / 1000000,
        dev_fund_left_pct: (devSupply / 58506540000000) * 100,
        founders_fund: 32492224,
      },
    }

    await env.KV_STATS.put("xray", JSON.stringify(stats))
  }
}

const cacheGitStats = async (env: Env) => {
  const repos = await fetch("https://api.github.com/orgs/xray-network/repos", {
    headers: {
      Authorization: `Bearer ${env.GIT_KEY}`,
      "X-GitHub-Api-Version": "2022-11-28",
      Accept: "application/vnd.github+json",
      "User-Agent": "Awesome-Octocat-App",
    },
  })
  const reposJson: any = await repos.json()
  const reposMapped = reposJson
    .map((repo: any) => {
      return {
        private: repo.private,
        name: repo.name,
        stars: repo.stargazers_count,
        watchers: repo.wawatchers,
      }
    })
    .filter((repo: any) => !repo.private)

  const dateUntil = new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString()
  const commmits = reposMapped.map((repo: any) => {
    return fetch(`https://api.github.com/repos/xray-network/${repo.name}/commits?since=${dateUntil}`, {
      headers: {
        Authorization: `Bearer ${env.GIT_KEY}`,
        "X-GitHub-Api-Version": "2022-11-28",
        Accept: "application/vnd.github+json",
        "User-Agent": "Awesome-Octocat-App",
      },
    })
      .then(async (reponse) => await reponse.json())
      .catch(() => [])
  })

  const commitsJson = await Promise.all(commmits)
  const commitsJsonMapped = commitsJson
    .map((repo, index) => {
      return repo.map((commit: any) => {
        return {
          repo_name: reposMapped?.[index]?.name,
          author: commit?.author?.login,
          author_avatar: commit?.author?.avatar_url,
          author_url: commit?.author?.html_url,
          message: commit?.commit?.message,
          date: commit?.commit?.author?.date,
          sha: commit?.sha,
          url: commit?.html_url,
        }
      })
    })
    .flat()
    .sort((a, b) => -a.date.localeCompare(b.date))

  await env.KV_STATS.put("git", JSON.stringify(commitsJsonMapped))
}

const getAllKVValues = async (namespace: KVNamespace) => {
  const keysResponse = await namespace.list()
  const keys = keysResponse.keys.map((key) => key.name)
  const valuePromises = keys.map((key) => namespace.get(key))
  const values = await Promise.all(valuePromises)
  return keys.map((key, index) => ({ key, value: values[index] }))
}

const getUrlSegments = (url: URL) => {
  const pathname = url.pathname
  const search = url.search
  const segments = pathname.replace(/^\//g, "").split("/")

  return {
    segments,
    pathname,
    search,
  }
}

const addContentTypeJSONHeaders = (response: Response) => {
  const headers = new Headers(response.headers)
  headers.set("Content-Type", "application/json")
  return new Response(response.body, { ...response, status: response.status, headers })
}

const addCorsHeaders = (response: Response) => {
  const headers = new Headers(response.headers)
  headers.set("Access-Control-Allow-Origin", "*")
  return new Response(response.body, { ...response, status: response.status, headers })
}

const addExpirationHeaders = (response: Response, time: number) => {
  const headers = new Headers(response.headers)
  headers.set("Cache-Control", `public, max-age=${time.toString()}`)
  headers.set("Expires", new Date(Date.now() + time * 1000).toUTCString())
  return new Response(response.body, { ...response, status: response.status, headers })
}

const throw404 = () => {
  return addCorsHeaders(new Response("404. API not found. Check if the request is correct", { status: 404 }))
}

const throw405 = () => {
  return addCorsHeaders(new Response("405. Method not allowed. Check if the request is correct", { status: 405 }))
}

const throw500 = () => {
  return addCorsHeaders(new Response("500. Server error! Something went wrong", { status: 500 }))
}

const throwReject = (response: Response) => {
  return addCorsHeaders(new Response(response.body, response))
}
