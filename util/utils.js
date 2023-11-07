function urlToCaddyUpstream(url) {
    var toURL = new URL(url)
    if (toURL.protocol.includes("https")) {
      var toPort = 443
    } else {
      var toPort = 80
    }
    if (toURL.port) {
      var toPort = toURL.port
    }
    return `${toURL.hostname}:${toPort}`
}

export default {
    urlToCaddyUpstream
}