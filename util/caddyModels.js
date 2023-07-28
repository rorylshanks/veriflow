/* var hostMatcher = "test.com"

var copyHeaders = {
  "X-Veriflow-User-Id": [
    "{http.reverse_proxy.header.X-Veriflow-User-Id}"
  ]
}

var proxyTo = "postman-echo.com:443"

 */

import { getConfig } from "./config.js"
import * as url from 'url';
import log from './logging.js';
import { writeFile } from "fs/promises";

function saturateRoute(proxyFrom, proxyTo, copyHeaders) {
  var routeModel = {
    match: [
      {
        host: [
          proxyFrom
        ]
      }
    ],
    handle: [
      {
        handler: "subroute",
        routes: [
          {
            handle: [
              {
                handle_response: [
                  {
                    match: {
                      status_code: [
                        2
                      ]
                    },
                    routes: [
                      {
                        handle: [
                          {
                            handler: "headers",
                            request: {
                              set: copyHeaders
                            }
                          }
                        ]
                      }
                    ]
                  }
                ],
                handler: "reverse_proxy",
                headers: {
                  request: {
                    set: {
                      "X-Forwarded-Method": [
                        "{http.request.method}"
                      ],
                      "X-Forwarded-Path": [
                        "{http.request.orig_uri.path}"
                      ],
                      "X-Forwarded-Protocol": [
                        "{http.request.scheme}"
                      ],
                      "X-Forwarded-Query": [
                        "{http.request.orig_uri.query}"
                      ],
                      "X-Forwarded-Uri": [
                        "{http.request.uri}"
                      ]
                    }
                  }
                },
                rewrite: {
                  method: "GET",
                  uri: "/.veriflow/verify"
                },
                upstreams: [
                  {
                    dial: "localhost:3000"
                  }
                ]
              }
            ]
          },
          {
            handle: [
              {
                handler: "subroute",
                routes: [
                  {
                    handle: [
                      {
                        handler: "reverse_proxy",
                        upstreams: [
                          {
                            dial: "localhost:3000"
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ],
            match: [
              {
                path: [
                  "/.veriflow/verify"
                ]
              }
            ]
          },
          {
            handle: [
              {
                handler: "reverse_proxy",
                transport: {
                  protocol: "http",
                  tls: {}
                },
                headers: {
                  request: {
                    set: {
                      "Host": [
                        "{http.reverse_proxy.upstream.hostport}"
                      ]
                    }
                  }
                },
                upstreams: [
                  {
                    dial: proxyTo
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    terminal: true
  }
  return routeModel
}

function saturateAllRoutesFromConfig(config) {
  var renderedRoutes = []
  var routes = config.policy
  for (var route of routes) {
    try {

      var fromURL = new URL(route.from)
      var toURL = new URL(route.to)
      if (toURL.protocol.includes("https")) {
        var toPort = 443
      } else {
        var toPort = 80
      }
      if (toURL.port) {
        var toPort = toURL.port
      }
      var toHostname = `${toURL.hostname}:${toPort}`
      var fromHostname = fromURL.hostname
      var copyHeaders = {
        "X-Veriflow-User-Id": [
          "{http.reverse_proxy.header.X-Veriflow-User-Id}"
        ]
      }
      if (route.claims_headers) {
        var headersArray = Object.keys(route.claims_headers)
        for (var header of headersArray) {
          copyHeaders[header] = [
            `{http.reverse_proxy.header.${header}}`
          ]
        }
      }
      var saturatedRoute = saturateRoute(fromHostname, toHostname, copyHeaders)
      renderedRoutes.push(saturatedRoute)
      // log.debug({ "message": "Added route", route })
    } catch (err) {
      console.error(err)
      log.error({ message: "Failed to parse route", route: route, error: err })
    }
  }
  return renderedRoutes
}

async function generateCaddyConfig() {
  var config = getConfig()
  var routes = saturateAllRoutesFromConfig(config)
  var superConfig = {
    "admin": {
      "disabled": true
    },
    "logging": {
      "logs": {
        "default": {
          "writer": {
            "output": "stdout"
          },
          "encoder": {
            "format": "json"
          }
        }
      }
    },
    "apps": {
      "http": {
        "http_port": 2080,
        "https_port": 2443,
        "servers": {
          "srv0": {
            "listen": [
              ":2080"
            ],
            "routes": routes
          }
        }
      }
    }
  }
  await writeFile("caddy.json", JSON.stringify(superConfig))

}

export default {
  generateCaddyConfig
}