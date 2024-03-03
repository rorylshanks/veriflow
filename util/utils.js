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

function convertHeaderCase(str) {
  return str
      .split('-') // Split the string into an array of words by hyphen
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize the first letter of each word and make the rest lowercase
      .join('-'); // Rejoin the words with hyphens
}

export default {
    urlToCaddyUpstream,
    convertHeaderCase
}