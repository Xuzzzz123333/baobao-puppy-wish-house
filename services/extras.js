const cloud = require('./cloud')

async function call(action, data) {
  if (!cloud.isConfigured()) {
    return { ok: false, reason: 'cloud_not_configured' }
  }
  try {
    const response = await cloud.callFunction('coupleExtras', {
      action,
      ...(data || {})
    })
    return response.result
  } catch (error) {
    console.error('情侣趣味功能调用失败', error)
    return { ok: false, reason: 'cloud_call_failed', error }
  }
}

module.exports = {
  getWeek(date) {
    return call('getWeek', { date })
  },
  saveDay(date, dishIds) {
    return call('saveDay', { date, dishIds })
  },
  getRatings() {
    return call('getRatings')
  },
  rateOrder(orderId, score, comment) {
    return call('rateOrder', { orderId, score, comment })
  },
  listOccasions() {
    return call('listOccasions')
  },
  saveOccasion(occasion) {
    return call('saveOccasion', occasion)
  },
  deleteOccasion(occasionId) {
    return call('deleteOccasion', { occasionId })
  }
}
