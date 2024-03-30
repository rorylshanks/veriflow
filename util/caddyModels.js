import { getConfig, getAuthListenPort, getRedirectBasepath } from "./config.js"
import log from './logging.js';
import { writeFile, stat } from "fs/promises";
import axios from 'axios';
import utils from './utils.js';
import errorpage from './errorpage.js'

// THis function removes null items from the individual routes
// In the below saturateRoute function we include several configuration items that may or may not be set based on the config, however must not be present when sending the config to Caddy
// So to keep the functions realtively simple and clean, we simply remove all null elements after the complete route is set. As this is not in the "hot path" and therefore not performance critical,
// Having this unoptimized logic should be fine.
function removeNullKeys(obj) {
  Object.keys(obj).forEach(key => {
      if (obj[key] === null) {
          delete obj[key];
      } else if (typeof obj[key] === 'object') {
          removeNullKeys(obj[key]);
      }
  });
  return obj
}

// Caddy is sensitive about its config, and a lot of things in the config require that all values are strings.
// For example, when setting request headers, all the header values must be strings and it will fail to load if they are a number or a boolean
// Same for the dynamic upstreams. The "port" for the dynamic upstreams MUST be a string, and not a number. Hence the purpose of this function
function convertNumbersAndBooleansToStrings(obj) {
  Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'number' || typeof obj[key] === 'boolean') {
          obj[key] = obj[key].toString();
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          convertNumbersAndBooleansToStrings(obj[key]);
      }
  });
  return obj
}

async function saturateRoute(route, routeId) {
  var config = getConfig()

  if (typeof route.from === 'object') {
    var routeMatcher = [route.from]
  } else {
    var fromURL = new URL(route.from)
    var proxyFrom = fromURL.hostname
    var routeMatcher = [
      {
        host: [
          proxyFrom
        ]
      }
    ]
  }

  // Required to be here due to usage in the dynamic backend configuration
  var copyHeaders = {
    "X-Veriflow-User-Id": [
      "{http.reverse_proxy.header.X-Veriflow-User-Id}"
    ]
  }

  var upstreams = null
  var dynamic_upstreams = null
  // Try to use dynamic backends somehow, either Caddy or Veriflow
  if (typeof route.to === 'object') {
    // If dynamic backends are enabled, proxy to whatever veriflow tells caddy to proxy to for that request
    if (route.to.source == "veriflow_dynamic") {
      var dynamic_backend_url_header_name = "X-Veriflow-Dynamic-Backend-Url"
      copyHeaders[dynamic_backend_url_header_name]
      var proxyTo = `{http.reverse_proxy.header.${dynamic_backend_url_header_name}}`
      upstreams = [
        {
          dial: proxyTo
        }
      ]
      if (route.to.copy_headers) {
        for (var header of route.to.copy_headers) {
          copyHeaders[header] = [
            `{http.reverse_proxy.header.${header}}`
          ]
        }
      }
    }

    if (route.to.source == "a" || route.to.source == "srv") {
      dynamic_upstreams = convertNumbersAndBooleansToStrings(route.to)
    }
  }

  // If the upstreams were not set by the above function, fallback to the default "static" upstream resolver
  // If it fails, the route will not be rendered and an error will be thrown
  if (!upstreams && !dynamic_upstreams) {
    var proxyTo = utils.urlToCaddyUpstream(route.to.url || route.to)
    var toURL = new URL(route.to.url || route.to)
    var isSecure = false
    if (toURL.protocol.includes("https")) {
      isSecure = true
    }
    if (route.https_upstream) {
      isSecure = true
    }
    upstreams = [
      {
        dial: proxyTo
      }
    ]
  }



  if (route.claims_headers) {
    var headersArray = Object.keys(route.claims_headers)
    for (var header of headersArray) {
      copyHeaders[utils.convertHeaderCase(header)] = [
        `{http.reverse_proxy.header.${utils.convertHeaderCase(header)}}`
      ]
    }
  }
  if (route.request_header_map_headers) {
    for (var header of route.request_header_map_headers) {
      copyHeaders[utils.convertHeaderCase(header)] = [
        `{http.reverse_proxy.header.${utils.convertHeaderCase(header)}}`
      ]
    }
  }

  if (route.remove_request_headers) {
    var requestHeadersToDelete = route.remove_request_headers
  }
  var requestHeadersToSet = {
    "Host": [
      route.preserve_host_header ? "{http.request.host}" : "{http.reverse_proxy.upstream.host}"
    ],
    "X-Veriflow-Request-Id": [
      "{http.request.uuid}"
    ]
  }
  if (route.set_request_headers) {
    for (var header of Object.keys(route.set_request_headers)) {
      requestHeadersToSet[header] = [route.set_request_headers[header]]
    }
  }
  requestHeadersToSet = convertNumbersAndBooleansToStrings(requestHeadersToSet)
  var tlsOptions = {}
  if (route.tls_client_cert_file && route.tls_client_key_file) {
    // This will fail if the files do not exist. Required as caddy will crash if the files so not exist
    await stat(route.tls_client_cert_file)
    await stat(route.tls_client_key_file)
    tlsOptions["client_certificate_file"] = route.tls_client_cert_file
    tlsOptions["client_certificate_key_file"] = route.tls_client_key_file
  }
  if (route.tls_skip_verify) {
    tlsOptions["insecure_skip_verify"] = true
  }
  // If no TLS options are set, and the route is "not secure" (i.e. not an HTTPS route) this var must be set to null to remove it from the Caddy config
  if ((Object.keys(tlsOptions).length == 0) && !isSecure) {
    tlsOptions = null
  }
  var redirectBasePath = config.redirect_base_path || "/.veriflow"
  var routeModel = {
    match: routeMatcher,
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
                            dial: "localhost:" + getAuthListenPort()
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
                      ],
                      "X-Veriflow-Route-Id": [
                        routeId
                      ],
                      "X-Veriflow-Request-Id": [
                        "{http.request.uuid}"
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
                    dial: "localhost:" + getAuthListenPort()
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
                upstreams, // This is set to null if dynamic_upstreams are used (source a, srv)
                dynamic_upstreams // This is set to null if there are no dynamic_upstreams used
              }
            ]
          }
        ]
      }
    ],
    terminal: true
  }
  var cleanedObject = removeNullKeys(routeModel)
  return cleanedObject
}

async function saturateAllRoutesFromConfig(config) {
  var renderedRoutes = []
  var routes = config.policy
  for (var routeId in routes) {
    try {
      var route = routes[routeId]
      var saturatedRoute = await saturateRoute(route, routeId)
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

  if (config?.admin?.enable == true && config?.admin?.allowed_groups) {
    log.info("Admin panel will be enabled")
    var serviceUrl = config.service_url
    var baseRedirectUrl = getRedirectBasepath()
    var adminUrl = new URL(`${serviceUrl}${baseRedirectUrl}/admin`)
    var adminPanelRoute = {
      from: {
        host: [adminUrl.hostname],
        path: [getRedirectBasepath() + "/admin/*"]
      },
      to: "http://localhost:" + getAuthListenPort(),
      allowed_groups: config.admin.allowed_groups,
      claims_headers: {
        "X-Veriflow-Admin-Jwt": "jwt"
      }
    }
    config.policy.unshift(adminPanelRoute)
  }

  var routes = await saturateAllRoutesFromConfig(config)

  var requestIdRoute = {
    "handle": [
      {
        "handler": "headers",
        "response": {
          "set": {
            "X-Veriflow-Request-Id": [
              "{http.request.uuid}"
            ]
          }
        }
      }
    ]
  }
  routes.unshift(requestIdRoute)

  if (config.enable_circuit_breaker_route !== false) {
    log.debug("Enabling circuit breaker route")
    const E_LOOP_DETECTED_HTML = await errorpage.renderErrorPage(503, "ERR_LOOP_DETECTED")
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
            "X-Veriflow-Request-Id": [
            ]
          }
        }
      ]
    }
    routes.unshift(circuitBreakerRoute)
  }


  var serviceUrl = new URL(config.service_url)
  var serviceRoute = {
    "match": [
      {
        "host": [
          serviceUrl.hostname
        ],
        "path": [
          "/ping",
          getRedirectBasepath() + "/verify", 
          getRedirectBasepath() + "/set",
          getRedirectBasepath() + "/logout", 
          getRedirectBasepath() + "/auth", 
          getRedirectBasepath() + "/callback",
          config.jwks_path || getRedirectBasepath() + "/jwks.json"
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
                    "dial": "localhost:" + getAuthListenPort()
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

  const E_NOT_FOUND_HTML = await errorpage.renderErrorPage(404, "ERR_ROUTE_NOT_FOUND")
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
          "veriflow": {
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
            },
            "metrics": {}
          }
        }
      }
    }
  }
  try {
    writeFile("caddy.json", JSON.stringify(superConfig))
    await updateCaddyConfig(superConfig)
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