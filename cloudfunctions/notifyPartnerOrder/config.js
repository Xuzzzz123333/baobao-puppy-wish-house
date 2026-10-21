/**
 * Subscription-message field mapping is safe to publish. The real template ID
 * lives in config.private.js, which is intentionally excluded from Git.
 */
let privateConfig = {}

try {
  privateConfig = require('./config.private')
} catch (error) {
  // Deployment will return a clear configuration error when the ID is empty.
}

module.exports = {
  templateId: process.env.ORDER_TEMPLATE_ID || privateConfig.templateId || '',
  fields: {
    title: 'thing1',
    description: 'thing4',
    username: 'thing13',
    amount: 'amount7',
    time: 'time6'
  }
}
