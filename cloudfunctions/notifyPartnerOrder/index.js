const cloud = require('wx-server-sdk')
const notificationConfig = require('./config')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
let collectionsReady = null

function ensureCollections() {
  if (!collectionsReady) {
    collectionsReady = Promise.all(
      ['users'].map(async name => {
        try {
          await db.createCollection(name)
        } catch (error) {
          // 集合已存在时会报错；实际读写错误仍会在后续步骤返回。
        }
      })
    )
  }
  return collectionsReady
}

function formatTime(timestamp) {
  const date = new Date(timestamp)
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

exports.main = async event => {
  await ensureCollections()
  const { OPENID } = cloud.getWXContext()
  const templateId = process.env.ORDER_TEMPLATE_ID || notificationConfig.templateId

  if (!templateId) {
    return { sent: false, reason: 'template_not_configured' }
  }

  // users 文档使用用户 OpenID 作为文档 ID，并保存 partnerOpenid。
  // 目标用户始终由服务端关系表获取，避免客户端伪造接收人。
  let user
  try {
    user = (await db.collection('users').doc(OPENID).get()).data
  } catch (error) {
    return { sent: false, reason: 'couple_not_bound' }
  }

  if (!user.partnerOpenid) {
    return { sent: false, reason: 'partner_not_found' }
  }

  let partner
  try {
    partner = (await db.collection('users').doc(user.partnerOpenid).get()).data
  } catch (error) {
    return { sent: false, reason: 'partner_not_found' }
  }
  const grantCount = Math.max(0, Number(partner.notificationGrantCount) || 0)
  if (!grantCount) {
    return { sent: false, reason: 'subscription_not_granted' }
  }

  try {
    const fields = notificationConfig.fields
    const messageData = {}
    const isStatusNotification = event.notificationType === 'status'
    const statusTitles = {
      accepted: '大厨已接单',
      preparing: '晚餐制作中',
      ready: '可以开饭啦',
      completed: '今晚用餐完成'
    }
    messageData[fields.title] = {
      value: isStatusNotification
        ? (statusTitles[event.orderStatus] || '晚餐状态更新')
        : '今晚菜单已确认'
    }
    messageData[fields.description] = {
      value: String(event.dishes || '新菜单').slice(0, 20)
    }
    messageData[fields.username] = {
      value: String(event.creatorNickname || '另一半').slice(0, 20)
    }
    messageData[fields.amount] = {
      value: `${Number(event.total || 0).toFixed(2)}元`
    }
    messageData[fields.time] = {
      value: formatTime(event.createdAt || Date.now())
    }

    await cloud.openapi.subscribeMessage.send({
      touser: user.partnerOpenid,
      page: isStatusNotification ? 'pages/us/us' : 'pages/matches/matches',
      lang: 'zh_CN',
      miniprogramState: process.env.MINIPROGRAM_STATE || 'developer',
      templateId,
      data: messageData
    })
    const remainingGrants = Math.max(0, grantCount - 1)
    await db.collection('users').doc(user.partnerOpenid).update({
      data: {
        notificationGrantCount: remainingGrants,
        notificationEnabled: remainingGrants > 0,
        updatedAt: db.serverDate()
      }
    })
    return { sent: true, remainingGrants }
  } catch (error) {
    console.error('subscribeMessage.send failed', error)
    try {
      await db.collection('users').doc(user.partnerOpenid).update({
        data: {
          notificationGrantCount: 0,
          notificationEnabled: false,
          updatedAt: db.serverDate()
        }
      })
    } catch (updateError) {
      console.error('reset notification grants failed', updateError)
    }
    return {
      sent: false,
      reason: 'send_failed',
      errorCode: error.errCode,
      errorMessage: error.errMsg
    }
  }
}
