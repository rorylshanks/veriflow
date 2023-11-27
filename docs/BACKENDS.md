# Backends Configuration in Veriflow

Veriflow's backend configurations offer various methods to manage and route network requests to different services. This document details the different backend types available in Veriflow, including their configurations and use cases.

## 1. Static Backend

The static backend is the most straightforward backend type, directing requests to a predetermined URL.

### Configuration

#### Standard Configuration

```yaml
to:
  source: static
  url: https://test.com
```

#### Shorthand Configuration

```yaml
to: https://test.com
```

In both cases, requests are routed to the specified hostname. Note that the path for the static configuration is ignored, and no path rewriting is performed.

## 2. Veriflow Dynamic Backend

Veriflow dynamic backends dynamically determine the routing of requests based on specific criteria set in the request.

### Configuration

```yaml
to:
  source: veriflow_dynamic
  url: https://rbi.veriflow.dev
  copy_headers:
    - Header1
  request_headers:
    Auth: test123
  request_body:
    USER: user
    URL: url
    S3_BUCKET: veriflow-rbi-test
```

- `source: veriflow_dynamic` specifies a dynamic backend managed by Veriflow.
- `url` points to the service that determines the routing decision.
- `copy_headers`, `request_headers`, and `request_body` are used to pass additional context to the decision-making service.

#### How it Works

When using a Veriflow dynamic backend, a POST request is sent to the specified `url` with the `request_body`. 

Additional fields are added to the request body as below:

- `original_headers`: Array of headers from the original request
- `user`: userId of the accessing user

The service at `url` is expected to respond with routing information, including the backend URL and any additional headers that should be included in the proxied request.

#### Expected Response

The external service should respond with a JSON object containing routing information. For example:

```json
{
  "url": "url_to_forward_to",
  "headers": [
    {
      "key": "Header1",
      "value": "headerValue1"
    }
  ]
}
```

- `url`: The backend URL to which the user request should be forwarded.
- `headers`: A list of headers to be added to the proxied request.

The Dynamic Backend Configuration feature is especially useful for scenarios that require complex routing logic that can't be encoded within static configurations, providing more flexibility and control over request handling.

## 3. DNS "A" Record Sourcing Backend

This backend dynamically routes requests based on DNS "A" records.

### Configuration

```yaml
to:
  source: a
  name: test.com
  port: 80
```

- `source: a` specifies that the backend uses DNS "A" record sourcing.
- `name` is the domain for which DNS "A" records are queried.
- `port` defines the port to be used for the connection.

## 4. DNS "SRV" Record Sourcing Backend

This backend type uses DNS "SRV" records to determine the routing of requests.

### Configuration

```yaml
to:
  source: srv
  name: _service._proto.name.
```

- `source: srv` indicates the use of DNS "SRV" records for sourcing.
- `name` specifies the SRV record to query.

Each of these backend types offers unique functionalities and can be chosen based on the specific requirements of your network configuration. The static and dynamic types provide straightforward and flexible routing options, respectively, while the DNS "A" and "SRV" record sourcing methods enable routing decisions based on real-time DNS information.