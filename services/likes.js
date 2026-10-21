const cloud = require('./cloud')

async function call(action, data) {
  if (!cloud.isConfigured()) {
    return { ok: false, reason: 'cloud_not_configured' }
  }
  try {
    const response = await cloud.callFunction('likesManager', {
      action,
      ...(data || {})
    })
    return response.result
  } catch (error) {
    console.error('云端口味默契操作失败', error)
    return { ok: false, reason: 'cloud_call_failed', error }
  }
}

function loadSummary() {
  return call('summary')
}

function setLike(dishId, liked) {
  return call('setLike', { dishId, liked })
}

function clearLikes() {
  return call('clear')
}

module.exports = {
  loadSummary,
  setLike,
  clearLikes
}
