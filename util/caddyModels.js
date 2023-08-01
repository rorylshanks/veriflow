import { getConfig } from "./config.js"
import log from './logging.js';
import { writeFile } from "fs/promises";
import axios from 'axios';

function saturateRoute(proxyFrom, proxyTo, route) {
  var config = getConfig()
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
  requestHeadersToSet = {
    "X-Veriflow-Request": [
      "true"
    ]
  }
  var tlsOptions = {}
  if (route.tls_client_cert_file && route.tls_client_key_file) {
    tlsOptions["client_certificate_file"] = route.tls_client_cert_file
    tlsOptions["client_certificate_key_file"] = route.tls_client_key_file
  }
  if (route.tls_skip_verify) {
    tlsOptions[insecure_skip_verify] = true
  }
  var redirectBasePath = config.redirect_base_path || "/.veriflow"
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
                handler: "subroute",
                routes: [
                  {
                    handle: [
                      {
                        handler: "reverse_proxy",
                        upstreams: [
                          {
                            dial: "localhost:" + config.auth_listen_port
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
                  redirectBasePath + "/verify"
                ]
              }
            ],
            terminal: true
          },
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
                  uri: redirectBasePath + "/verify?"
                },
                upstreams: [
                  {
                    dial: "localhost:" + config.auth_listen_port
                  }
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
    } catch (error) {
      var errorObject = {
        message: error.message,
        name: error.name,
        stack: error.stack
      };
      log.error({ message: "Failed to parse route", route: route, error: errorObject })
    }
  }
  return renderedRoutes
}

async function generateCaddyConfig() {
  log.debug("Generating new caddy config")
  var config = getConfig()
  var routes = saturateAllRoutesFromConfig(config)
  var circuitBreakerRoute = {
    "handle": [
      {
        "handler": "subroute",
        "routes": [
          {
            "handle": [
              {
                "body": "<!DOCTYPE html><html><head><title>Bad Request | Veriflow</title></head><body><h1>400 Bad Request</h1><p>We detected a loop in the veriflow configuration. Please ask your administrator.</p></body></html>",
                "close": true,
                "handler": "static_response",
                "status_code": 400
              }
            ]
          }
        ]
      }
    ],
    "match": [
      {
        "header": {
          "X-Veriflow-Request": [
            "true"
          ]
        }
      }
    ]
  }
  routes.unshift(circuitBreakerRoute)

  var serviceUrl = new URL(config.service_url)
  var serviceRoute = {
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
                    "dial": "localhost:" + config.auth_listen_port
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
  var defaultRoute = {
    "handle": [
      {
        "handler": "subroute",
        "routes": [
          {
            "handle": [
              {
                "body": "<!DOCTYPE html><html><head><title>404 Site Not Found | Veriflow</title></head><body><h1>404 Site Not Found</h1><p>The requested site cannot be found in the Veriflow configuration. Please ask your administrator.</p></body></html>",
                "close": true,
                "handler": "static_response",
                "status_code": 404,
                "headers": {
                  "Content-Type": [
                    "text/html"
                  ]
                }
              }
            ]
          }
        ]
      }
    ],
    "terminal": true
  }
  routes.push(serviceRoute)
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
        "http_port": config.data_listen_port,
        "https_port": 2443,
        "servers": {
          "srv0": {
            "listen": [
              ":" + config.data_listen_port
            ],
            "routes": routes,
            "logs": {
              "default_logger_name": "default"
            }
          }
        }
      }
    }
  }
  try {
    await updateCaddyConfig(superConfig)
    writeFile("caddy.json", JSON.stringify(superConfig))
  } catch (error) {
    log.error({ message: "Failed to update running caddy config", error: error })
  }

}

async function updateCaddyConfig(config) {
  const url = 'http://localhost:2019/load';
  const response = await axios.post(url, config, {
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 200) {
    log.info('Successfully updated Caddy config');
    return response.data;
  } else {
    throw new Error('Failed to update Caddy config, response status: ' + response.status);
  }
}

export default {
  generateCaddyConfig
}