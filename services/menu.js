const cloud = require('./cloud')

async function call(action, data) {
  if (!cloud.isConfigured()) {
    return { ok: false, reason: 'cloud_not_configured' }
  }
  try {
    const response = await cloud.callFunction('menuManager', {
      action,
      ...(data || {})
    })
    return response.result
  } catch (error) {
    console.error('云端菜单操作失败', error)
    return { ok: false, reason: 'cloud_call_failed', error }
  }
}

function loadMenu() {
  return call('list')
}

function createDish(dish) {
  return call('create', { dish })
}

function updateDish(dishId, dish) {
  return call('update', { dishId, dish })
}

function deleteDish(dishId) {
  return call('delete', { dishId })
}

function reorderDishes(dishIds) {
  return call('reorder', { dishIds })
}

function updateSettings(expectedDinnerTime) {
  return call('updateSettings', { expectedDinnerTime })
}

async function uploadDishImage(filePath) {
  if (!cloud.init()) {
    return { ok: false, reason: 'cloud_not_configured' }
  }
  const extensionMatch = String(filePath || '').match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'jpg'
  const cloudPath = `dish-images/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
  try {
    const result = await wx.cloud.uploadFile({
      cloudPath,
      filePath
    })
    return { ok: true, fileID: result.fileID }
  } catch (error) {
    console.error('上传菜品图片失败', error)
    return { ok: false, reason: 'upload_failed', error }
  }
}

module.exports = {
  loadMenu,
  createDish,
  updateDish,
  deleteDish,
  reorderDishes,
  updateSettings,
  uploadDishImage
}
