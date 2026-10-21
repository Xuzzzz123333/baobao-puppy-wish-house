/**
 * Public configuration loader.
 *
 * Copy cloud.private.example.js to cloud.private.js and fill in the CloudBase
 * environment ID. The private file is intentionally excluded from Git.
 */
let privateConfig = {}

try {
  privateConfig = require('./cloud.private')
} catch (error) {
  // Keep the repository safe to share. The app shows a setup hint when empty.
}

module.exports = {
  envId: privateConfig.envId || ''
}
