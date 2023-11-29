# Matchers Configuration in Veriflow

In Veriflow, routing decisions are based on matchers defined in the policy configurations. This document, `MATCHERS.md`, explains the available options for configuring matchers using the `from:` field in Veriflow policies.

## 1. Basic Matcher

The basic matcher in Veriflow is used to route requests based on the host header. It is a straightforward way to define routing rules based on the hostname of incoming requests.

### Configuration

#### Example

```yaml
from: https://test.com
```

In this configuration:

- `from: https://test.com` specifies that all requests with a host header of `test.com` will be matched.
- This matcher does not consider the path of the request URL; only the hostname is used as the matcher.

## 2. Advanced Route Matching

Veriflow now supports "Advanced Route Matching," allowing for more nuanced and powerful control over route definitions. This enhancement leverages the functionality of Caddy as its data layer, enabling complex route matching scenarios.

### Configuring Advanced Route Matching

To use Advanced Route Matching, define the matching criteria in your policy configurations within the `config.yaml` file. Here’s an example:

```yaml
- from:
    host:
    - test-advanced-matchers.localtest.me
    path:
    - "/get"
```

In this configuration:

- `host`: Defines the hostnames that the route should match. In this case, it’s `test-advanced-matchers.localtest.me`.
- `path`: Specifies the paths that should match, such as requests to the `/get` path.

### Matching Priority

With Advanced Route Matching, if there are overlapping routes, the route listed first in the configuration file will take precedence. This ordering provides clear control over which rules are applied first in complex configurations.

### Available Matchers

Veriflow's use of Caddy as its data layer means a variety of matchers are supported for intricate routing configurations. These matchers, detailed in the [Caddy documentation](https://caddyserver.com/docs/json/apps/http/servers/routes/match/), include:

- **Host**: For matching based on hostnames in the request.
- **Path**: To match specific URL paths.
- **Header**: For matching requests with specific header values.
- **Query**: To match based on query string parameters.
- **Method**: For matching specific HTTP methods (GET, POST, etc.).

### Important Note for Path Matching

When configuring Advanced Route Matching in Veriflow, especially when using path matching, it's crucial to include a match for the `/.veriflow/*` path. This step ensures that callback functions and other internal Veriflow mechanisms operate correctly.

Advanced Route Matching in Veriflow significantly enhances routing capabilities, offering a sophisticated approach to managing access and directing traffic in complex network environments.

---

These matcher configurations in Veriflow allow for both simple and complex routing scenarios, ensuring that network traffic can be directed accurately and efficiently based on specific criteria. The Basic Matcher offers ease of use for straightforward host-based routing, while the Advanced Matchers provide the flexibility needed for more nuanced routing requirements.