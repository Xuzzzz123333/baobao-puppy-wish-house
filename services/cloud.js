const config = require('../config/cloud')

let initialized = false

function isConfigured() {
  return Boolean(config.envId && wx.cloud)
}

function init() {
  if (!isConfigured() || initialized) return isConfigured()
  wx.cloud.init({
    env: config.envId,
    traceUser: true
  })
  initialized = true
  return true
}

function callFunction(name, data) {
  if (!init()) {
    return Promise.reject(new Error('cloud_not_configured'))
  }
  return wx.cloud.callFunction({ name, data })
}

module.exports = {
  isConfigured,
  init,
  callFunction
}
