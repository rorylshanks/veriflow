
<a name="readme-top"></a>

<div align="center">
<a href="https://github.com/rorylshanks/veriflow">
    <img src="https://codemo.re/images/veriflow.png" alt="Logo" width="475" height="103">
</a>

<h3 align="center">Veriflow Access Proxy</h3>

  <p align="center">
    Veriflow serves as a user-context-aware Access proxy, enabling secure control of internal services and infrastructure. 
    <br />
    <br />
    <a href="https://github.com/rorylshanks/veriflow/issues">Report Bug</a>
    ·
    <a href="https://github.com/rorylshanks/veriflow/issues">Request Feature</a>
  </p>
</div>

<!-- ABOUT THE PROJECT -->
## About The Project

Veriflow is an innovative, context-sensitive access management solution developed as a competitive alternative to existing options such as Pomerium. Born out of a need for enhanced, versatile, and user-friendly access control, Veriflow excels in providing secure, streamlined, and comprehensive management of internal services and infrastructure across all hosting environments. 

Three key reasons make Veriflow stand out:

1. **Context-Aware Security**: Veriflow's context-aware gateway functionality takes security to the next level by adapting to various internal service and infrastructure environments, thereby providing robust, intelligent, and reliable access control.

2. **Adaptable & Scalable**: Whether your infrastructure is hosted on-premise, in the cloud, or a combination of both, Veriflow is designed to adapt to your needs, ensuring scalability and flexibility.

3. **User-Friendly Configuration**: The configuration of Veriflow is straightforward and intuitive. Each parameter is designed to be self-explanatory, making it easy for administrators to understand and manage access control, ultimately reducing complexity and saving time.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## How It Works

Veriflow acts as a reverse proxy for all requests, and sits at the ingress point of your network. When a user tries to access a service that is served by Veriflow, the below sequence will take place.

![Sign in flow](docs/img/sign-in-flow.png)

<!-- GETTING STARTED -->
## Getting Started

A prebuilt Docker container is available from Dockerhub, containing Veriflow. You can pull the image by simply running

```
docker run -p 2080:2080 -v $(pwd)/config.yaml:/appdata/config.yaml rorylshanks/veriflow:latest
```

You may specify a different configuration file location using the `CONFIG_FILE` env var

```
docker run -p 2080:2080 -e CONFIG_FILE=/etc/config.yaml -v config.yaml:/etc/config.yaml rorylshanks/veriflow:latest
```

## Veriflow Signing Key

Veriflow uses JSON Web Tokens (JWTs) to authenticate requests and responses. JWTs are JSOn objects that are signed by a specific private key. It is critical for security that the private key that is used is randomly generated and not shared or stored publicly. 

To generate a new signing key, you can run the below command on any linux system 

```
openssl genrsa 4096 | base64 -w0
```

Or the below command on macOS

```
openssl genrsa 4096 | base64 -b0
```

This will generate a base64 encoded 4096-bit RSA private key that can be used in the Veriflow configuration. Do NOT reuse any example signing keys you find on the internet, as this will allow anyone to impersonate users on Veriflow.

## Veriflow Configuration Options

An example configuration file can be found in `example-config.yaml`. A breakdown of each option is below

- `data_listen_port`: Port on which the data server listens.
- `metrics_listen_port`: Port where the metrics server should listen.
- `service_url`: URL of the Veriflow service.
- `cookie_secret`: Secret key used for cookie encryption and verification.
- `cookie_settings`: Settings related to the session cookie set by Veriflow for each site. 
    - `sameSite`: Sets the sameSite attribute of the cookie. Default "Lax"
    - `secure`: Sets whether the cookie should be secure. Default "false"
    - `maxAge`: Sets the maximim time of the authenticated sessions in milliseconds (default 3 hours [3600000])
- `redis_connection_string`: Connection string for the redis server to connect to (e.g. redis://127.0.0.1:6379)
- `idp_client_id`: Client ID for communication with the Identity Provider (IdP).
- `idp_client_secret`: Secret key for authenticating with the Identity Provider (IdP).
- `idp_tenant_id`: Identifier for the specific tenant in the Identity Provider's system.
- `idp_provider`: Identity Provider system. Currently only support Microsoft Graph
- `idp_provider_scope`: Authorization scopes for the Identity Provider.
- `idp_provider_user_id_claim`: Claim used to identify the user in the Identity Provider.
- `idp_provider_url`: URL of the Identity Provider service.
- `idp_refresh_directory_interval`: How often the directory information should be refreshed from the Identity Provider.
- `idp_refresh_directory_timeout`: How long the system should wait for a directory refresh before timing out.
- `idp_provider_token_claims_user_ttl`: For the `tokenclaims` IdP provider - Determines how long (in seconds) the user will exist in the Veriflow database before being deleted and requiring a re-auth. Default is 604800 (7 days)
- `signing_key`: RSA private key for signing JWT tokens, encoded in base64.
- `redirect_base_path`: Base path for redirection URLs. By default `/.veriflow`
- `jwks_path`: Location of the JSON Web Key Set (JWKS) that can be called to get the public keys of the signing key.
- `trusted_ranges`: IP ranges that are trusted as being reverse proxies. Useful for running Veriflow behind proxies. 
- `jwt_issuer_expires_in`: A time duration that indicates how long issued JWTs should be valid for. Default 10s
- `policy`: Policy for access control. This includes:
    - `title`: Title of the policy.
    - `from`: Source URL or advanced matching policy For more details, see [docs/MATCHERS.md](docs/MATCHERS.md)
    - `to`: Destination backend configuration. For more details, see [docs/BACKENDS.md](docs/BACKENDS.md)
    - `tls_skip_verify`: Whether to ignore upstream certificate errors. Default `false`
    - `allow_public_unauthenticated_access`: Whether to allow public access to the route (note this will disable all Veriflow user-related functionality). Default `false`
    - `claims_headers`: Headers to include in the JWT claims.
    - `jwt_override_audience`: Sets the `aud` key of the JWT added to the header specified in claims_headers. By default it is the hostname of the `to`
    - `allowed_groups`: Groups allowed access.
    - `cors_allow_preflight`: Whether to allow preflight CORS requests (HTTP `OPTIONS` requests).
    - `remove_request_headers`: Headers to remove from the request.
    - `set_request_headers`: Headers to set for the request.
    - `token_auth_config_file`: The location of the external JSON file containing the token definitions (e.g., `"token-auth.json"`).
    - `token_auth_header`: The name of the HTTP header that should contain the token (e.g., `Authorization`).
    - `token_auth_header_prefix`: The prefix that should be present before the token in the HTTP header (e.g., `"Basic "`).
    - `token_auth_is_base64_encoded`: Boolean value indicating whether the token is Base64 encoded (`true` or `false`).
    - `request_header_map_file`: This parameter specifies the location of the external JSON file containing the header definitions for per-user and per-group request header mapping (e.g., `request_header_map.json`).
    - `request_header_map_headers`: This is a list of the names of the HTTP headers that should be set for the requests for per-user request header mapping
    - `tls_client_cert_file`: Path to the client certificate file that should be used for upstream authentication (mTLS)
    - `tls_client_key_file`: Path to the client certificate key that should be used for upstream authentication (mTLS)
    - `token_auth_dynamic_config`: Configuration for dynamic token authentication services
        - `url`: URL of the external token authentication service
        - `headers`: A map of headers that will be sent downstream to the authentication service

## Token Authentication in Veriflow

In Veriflow, the token authentication functionality provides an alternative to the typical Single Sign-On (SSO) flow. It uses externally defined tokens for authorizing users and facilitating programmatic access. The token auth is configured at two places.

### Per-Policy Configuration

Within the policy configuration, several parameters can be set. See above for the token_auth parameters

### External Token Authentication

The JSON file specified in `token_auth_config_file` should contain a configuration object for each token, structured to differentiate between user-based tokens and machine tokens. Below is an example structure:

```json
{
    "UserToken": {
        "userId": "exampleUserId",
        "valid_domains": [
            "**"
        ]
    },
    "MachineToken": {
        "id": "c2bc52a6-58e6-435a-a84f-65e7c1b5bdf4",
        "machine_token": true,
        "valid_domains": [
            "api.example.com",
            "*.internal.example.com"
        ],
        "valid_paths": [
            "/api/allow",
            "/internal/data"
        ],
        "valid_methods": [
            "GET",
            "POST"
        ]
    }
}
```

In this object:

1. **User-based Token (`UserToken`)**:
    - `"userId"`: This is the unique identifier of the user in the Identity Provider (IdP). The token is associated with this user, and additional authorization checks will be performed based on the user's permissions in the system.
    - `"valid_domains"`: An array of domain patterns where this user’s token is valid. The `"**"` pattern indicates the token is valid for all domains, but you can specify specific domains or subdomains as needed. Domain patterns can be globbed using the [Picomatch](https://github.com/micromatch/picomatch) library, allowing for flexible domain matching.

2. **Machine Token (`MachineToken`)**:
    - `"machine_token"`: This should be set to `true` to indicate that the token is a machine token, which is not associated with any user in the IdP.
    - `"id"`: This is an ID that is used to lookup the token in the request header map headers, and also used as the user ID in any JWTs that are requested to be added.
    - `"valid_domains"`: An array of domain patterns where the machine token is valid. Unlike user tokens, this typically includes specific domains, such as `"api.example.com"` or `"*.internal.example.com"`. Domain patterns can be globbed using the [Picomatch](https://github.com/micromatch/picomatch) library.
    - `"valid_paths"`: An array of URL paths where the machine token is allowed to be used. This can include specific endpoints like `"/api/allow"` or directories like `"/internal/data"`. Path patterns can also be globbed using the [Picomatch](https://github.com/micromatch/picomatch) library, enabling flexible matching of URL paths.
    - `"valid_methods"`: An array of HTTP methods that are allowed for this token, such as `"GET"` or `"POST"`. Method patterns can also be globbed using the [Picomatch](https://github.com/micromatch/picomatch) library, allowing for flexible specification of allowed HTTP methods.

### Security Considerations

Ensure that both the JSON configuration file and the policy configuration are kept secure, as they contain sensitive information that controls access to your services. Misconfiguration or unauthorized access to these files could lead to significant security vulnerabilities.

## Request Header Mapping

The Request Header Mapping is a powerful functionality in Veriflow that allows administrators to set specific request headers per user, per route. This feature enhances flexibility by providing a more granular approach to managing requests. For per-route options, please see the above route definition.

The JSON file specified in `request_header_map_file` should contain an object for each user, structured as follows:

```json
{
    "ENTER_USER_ID_OR_GROUP_ID_OR TOKEN_ID_HERE": {
        "Authorization": "test",
        "X-test-Header": "another test"
    }
}
```

In this object:

- `"ENTER_USER_ID_OR_GROUP_ID_HERE"` should be replaced with the ID of the user or group for whom you're setting the headers.
- The key-value pairs inside the user or group object correspond to the headers you wish to set, with the header name as the key and the header value as the value.

Upon configuration, Veriflow will automatically add the requested headers to each upstream request based on the user that accesses the service. This allows for personalized and context-specific request handling. Please remember to keep your JSON file and the policy configuration secure due to the sensitive nature of header information.

## Dynamic Token Authentication

Veriflow now supports Dynamic Token Authentication, which allows the system to validate tokens against an external API dynamically. This method is particularly useful when you need real-time token validation that adapts to evolving authorization needs without changing the service's static configuration.

### Configuration of Dynamic Token Authentication

To use Dynamic Token Authentication, you should configure the `token_auth_dynamic_config` parameter in your `config.yaml` file as follows:

```yaml
token_auth_dynamic_config:
  url: https://token-service.veriflow.dev/check
  headers:
    Auth: fake
```

With this configuration:

- `url`: specifies the external service endpoint for token validation.
- `headers`: defines any headers that need to be sent with the validation request. In this case, an `Auth` header with a value of `fake` is included.

### How it Works

When a token needs validation, Veriflow will send a POST request to the configured URL with a JSON payload containing the token:

```json
{
  "token": "TOKEN_HERE"
}
```

The external service must respond with a JSON object containing the token configuration. For an example token configuration please see the above documentation for the token file.

It's essential to implement appropriate security measures when dealing with dynamic token authentication to prevent unauthorized access.

## Roadmap

- [ ] Add device-aware context
- [ ] Add UI for debugging users
- [x] Fix getRouteFromRequest to also match based on path
- [x] Add metrics for monitoring
- [ ] Better logging

See the [open issues](https://github.com/rorylshanks/veriflow/issues) for a full list of proposed features (and known issues).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>
