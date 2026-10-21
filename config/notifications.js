/**
 * Public configuration loader.
 *
 * Copy notifications.private.example.js to notifications.private.js and fill
 * in the subscription-message template ID. The private file is ignored by Git.
 */
let privateConfig = {}

try {
  privateConfig = require('./notifications.private')
} catch (error) {
  // Missing private configuration is handled by the notification service.
}

module.exports = {
  templateId: privateConfig.templateId || '',
  cloudFunctionName: privateConfig.cloudFunctionName || 'notifyPartnerOrder'
}
