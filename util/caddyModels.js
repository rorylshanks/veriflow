import { getConfig } from "./config.js"
import log from './logging.js';
import { writeFile } from "fs/promises";
import axios from 'axios';
import utils from './utils.js';
import errorpage from './errorpage.js'

function saturateRoute(proxyFrom, proxyTo, route, isSecure) {
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
  if (route.request_header_map_headers) {
    for (var header of route.request_header_map_headers) {
      copyHeaders[header] = [
        `{http.reverse_proxy.header.${header}}`
      ]
    }
  }
  // If dynamic backends are enabled, proxy to whatever veriflow tells caddy to proxy to for that request
  if (route.dynamic_backend_config) {
    var dynamic_backend_url_header_name = "X-Veriflow-Dynamic-Backend-Url"
    copyHeaders[dynamic_backend_url_header_name]
    proxyTo = `{http.reverse_proxy.header.${dynamic_backend_url_header_name}}`
    if (route.dynamic_backend_config.copy_headers) {
      for (var header of route.dynamic_backend_config.copy_headers) {
        copyHeaders[header] = [
          `{http.reverse_proxy.header.${header}}`
        ]
      }
    }
  }
  if (route.remove_request_headers) {
    var requestHeadersToDelete = route.remove_request_headers
  }
  var requestHeadersToSet = {
    "Host": [
      route.preserve_host_header ? "{http.request.host}" : "{http.reverse_proxy.upstream.host}"
    ],
    "X-Veriflow-Request": [
      "true"
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
    tlsOptions["insecure_skip_verify"] = true
  }
  if ((Object.keys(tlsOptions).length == 0) && !isSecure) {
    tlsOptions = null
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
                  redirectBasePath + "/set"
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
                  uri: redirectBasePath + "/verify?" // The question mark is important as otherwise caddy will retain the query string when forwarding to veriflow
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
      var toHostname = utils.urlToCaddyUpstream(route.to)
      var toURL = new URL(route.to)
      var isSecure = false
      if (toURL.protocol.includes("https")) {
        isSecure = true
      }
      if (route.https_upstream) {
        isSecure = true
      }
      var fromHostname = fromURL.hostname
      var saturatedRoute = saturateRoute(fromHostname, toHostname, route, isSecure)
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

  const E_LOOP_DETECTED_HTML = await errorpage.renderErrorPage(503, "ERR_LOOP_DETECTED")
  const E_NOT_FOUND_HTML = await errorpage.renderErrorPage(404, "ERR_ROUTE_NOT_FOUND")

  var circuitBreakerRoute = {
    "handle": [
      {
        "handler": "subroute",
        "routes": [
          {
            "handle": [
              {
                "body": E_LOOP_DETECTED_HTML,
                "close": true,
                "handler": "static_response",
                "status_code": 503,
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
                "body": E_NOT_FOUND_HTML,
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
            },
            "trusted_proxies": {
              "ranges": config.trusted_ranges || [],
              "source": "static"
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