import { getConfig } from "./config.js"
import log from './logging.js';
import { writeFile } from "fs/promises";
import axios from 'axios';

function saturateRoute(proxyFrom, proxyTo, route) {
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
  if (route.remove_request_headers) {
    var requestHeadersToDelete = route.remove_request_headers
  }
  var requestHeadersToSet = {
    "Host": [
      "{http.reverse_proxy.upstream.hostport}"
    ]
  }
  if (route.set_request_headers) {
    for (var header of Object.keys(route.set_request_headers)) {
      requestHeadersToSet[header] = [route.set_request_headers[header]]
    }
  }
  var tlsOptions = {}
  if (route.tls_client_cert_file && route.tls_client_key_file) {
    tlsOptions["client_certificate_file"] = route.tls_client_cert_file
    tlsOptions["client_certificate_key_file"] = route.tls_client_key_file
  }
  if (route.tls_skip_verify) {
    tlsOptions[insecure_skip_verify] = true
  }
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
                  tls: tlsOptions
                },
                headers: {
                  request: {
                    delete: requestHeadersToDelete || [],
                    set: requestHeadersToSet || []
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

      var saturatedRoute = saturateRoute(fromHostname, toHostname, route)
      renderedRoutes.push(saturatedRoute)
      // log.debug({ "message": "Added route", route })
    } catch (err) {
      console.error(err)
      // log.error({ message: "Failed to parse route", route: route, error: err })
    }
  }
  return renderedRoutes
}

async function generateCaddyConfig() {
  log.debug("Generating new caddy config")
  var config = getConfig()
  var routes = saturateAllRoutesFromConfig(config)
  var serviceUrl = new URL(config.service_url)
  var defaultRoute = {
    "match": [
      {
        "host": [
          serviceUrl.hostname
        ]
      }
    ],
    "handle": [
      {
        "handler": "subroute",
        "routes": [
          {
            "handle": [
              {
                "handler": "reverse_proxy",
                "upstreams": [
                  {
                    "dial": "localhost:3000"
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    "terminal": true
  }
  routes.push(defaultRoute)
  var superConfig = {
    "admin": {
      "disabled": false
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
  try {
    await updateCaddyConfig(superConfig)
  } catch (error) {
    log.error({message: "Failed to update running caddy config", error: error})
  }

}

async function updateCaddyConfig(config) {
  try {
    const url = 'http://localhost:2019/load';
    const response = await axios.post(url, config, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200) {
      console.log('Successfully updated Caddy config');
      return response.data;
    } else {
      throw new Error('Failed to update Caddy config, response status: ' + response.status);
    }
  } catch (error) {
    // console.error('Error updating Caddy config:', error);
    // throw error;
  }
}

export default {
  generateCaddyConfig
}