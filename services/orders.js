const cloud = require('./cloud')

async function call(action, data) {
  if (!cloud.isConfigured()) {
    return { ok: false, reason: 'cloud_not_configured' }
  }
  try {
    const response = await cloud.callFunction('orderManager', {
      action,
      ...(data || {})
    })
    return response.result
  } catch (error) {
    console.error('云端订单操作失败', error)
    return { ok: false, reason: 'cloud_call_failed', error }
  }
}

function saveOrder(order) {
  return call('save', { order })
}

function listOrders() {
  return call('list')
}

function updateStatus(orderId, status) {
  return call('updateStatus', { orderId, status })
}

function clearHistory() {
  return call('clearHistory')
}

function deleteOrder(orderId) {
  return call('delete', { orderId })
}

module.exports = {
  saveOrder,
  listOrders,
  updateStatus,
  clearHistory,
  deleteOrder
}
