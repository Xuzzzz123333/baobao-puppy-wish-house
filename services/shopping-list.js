const cloud = require('./cloud')

async function call(action, data) {
  if (!cloud.isConfigured()) {
    return { ok: false, reason: 'cloud_not_configured' }
  }
  try {
    const response = await cloud.callFunction('shoppingListManager', {
      action,
      ...(data || {})
    })
    return response.result
  } catch (error) {
    console.error('云端采购清单操作失败', error)
    return { ok: false, reason: 'cloud_call_failed', error }
  }
}

function getList() {
  return call('get')
}

function generateFromOrder(orderId) {
  return call('generate', { orderId })
}

function addItem(item) {
  return call('addItem', { item })
}

function updateItem(itemId, item) {
  return call('updateItem', { itemId, item })
}

function deleteItem(itemId) {
  return call('deleteItem', { itemId })
}

function markAllPurchased() {
  return call('markAllPurchased')
}

function clearList() {
  return call('clear')
}

module.exports = {
  getList,
  generateFromOrder,
  addItem,
  updateItem,
  deleteItem,
  markAllPurchased,
  clearList
}
