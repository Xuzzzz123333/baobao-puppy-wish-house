const config = require('../config/notifications')
const cloud = require('./cloud')

function isConfigured() {
  return Boolean(cloud.isConfigured() && config.templateId)
}

function requestNotificationPermission() {
  if (!isConfigured()) {
    return Promise.resolve({ accepted: false, reason: 'not_configured' })
  }

  return new Promise(resolve => {
    wx.requestSubscribeMessage({
      tmplIds: [config.templateId],
      success(result) {
        resolve({
          accepted: result[config.templateId] === 'accept',
          raw: result
        })
      },
      fail(error) {
        resolve({ accepted: false, reason: 'request_failed', error })
      }
    })
  })
}

async function sendPartnerOrderNotification(order) {
  if (!isConfigured()) {
    return { sent: false, reason: 'not_configured' }
  }

  try {
    const result = await cloud.callFunction(
      config.cloudFunctionName,
      {
        orderId: order.id,
        creatorNickname: order.creatorNickname,
        dishes: order.items.map(item => `${item.name}×${item.quantity}`).join('、'),
        notes: order.notes.join('、') || '无',
        total: order.total,
        createdAt: order.createdAt
      }
    )
    return {
      sent: Boolean(result.result && result.result.sent),
      result: result.result
    }
  } catch (error) {
    console.error('发送点菜提醒失败', error)
    return { sent: false, reason: 'cloud_call_failed', error }
  }
}

async function sendOrderStatusNotification(order, actorNickname) {
  if (!isConfigured()) {
    return { sent: false, reason: 'not_configured' }
  }
  try {
    const result = await cloud.callFunction(
      config.cloudFunctionName,
      {
        notificationType: 'status',
        orderStatus: order.status,
        creatorNickname: actorNickname || '大厨',
        dishes: (order.items || []).map(item => item.name).join('、'),
        total: order.total,
        createdAt: Date.now()
      }
    )
    return {
      sent: Boolean(result.result && result.result.sent),
      result: result.result
    }
  } catch (error) {
    return { sent: false, reason: 'cloud_call_failed', error }
  }
}

module.exports = {
  isConfigured,
  requestNotificationPermission,
  sendPartnerOrderNotification,
  sendOrderStatusNotification
}
