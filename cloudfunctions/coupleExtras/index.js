const crypto = require('crypto')
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
let collectionsReady = null

function ensureCollections() {
  if (!collectionsReady) {
    collectionsReady = Promise.all(
      ['users', 'dishes', 'orders', 'weeklyPlans', 'orderRatings', 'occasions']
        .map(async name => {
          try {
            await db.createCollection(name)
          } catch (error) {
            // 集合已存在时会报错；真实读写错误仍由后续操作返回。
          }
        })
    )
  }
  return collectionsReady
}

function hash(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 24)
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function cleanIds(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(
    value.map(item => cleanText(item, 80)).filter(Boolean)
  )).slice(0, 30)
}

function validDate(value) {
  const text = cleanText(value, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? text
    : ''
}

function weekStartOf(dateText) {
  const [year, month, day] = dateText.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const offset = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - offset)
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-')
}

async function getUser(openid) {
  if (!openid) return null
  try {
    return (await db.collection('users').doc(openid).get()).data
  } catch (error) {
    return null
  }
}

async function getContext(openid) {
  const me = await getUser(openid)
  if (!me) return { ok: false, reason: 'account_not_found' }
  const partner = me.partnerOpenid ? await getUser(me.partnerOpenid) : null
  const memberOpenids = partner
    ? [openid, me.partnerOpenid].sort()
    : [openid]
  return {
    ok: true,
    me,
    partner,
    paired: Boolean(partner),
    memberOpenids,
    memberA: memberOpenids[0],
    memberB: memberOpenids[1] || '',
    pairKey: hash(memberOpenids.join(':'))
  }
}

async function resolveChef(openid, context) {
  if (context.me.role === 'chef') return openid
  if (
    context.me.role === 'diner' &&
    context.partner &&
    context.partner.role === 'chef'
  ) {
    return context.me.partnerOpenid
  }
  return ''
}

async function getMenuMap(openid, context) {
  const chefOpenid = await resolveChef(openid, context)
  if (!chefOpenid) return new Map()
  const result = await db.collection('dishes')
    .where({ chefOpenid })
    .limit(100)
    .get()
  return new Map(result.data.map(dish => [
    dish.dishId,
    {
      id: dish.dishId,
      name: dish.name,
      icon: dish.icon || '🍽️',
      imageUrl: dish.imageUrl || '',
      available: dish.available !== false
    }
  ]))
}

async function checkTextSafety(openid, content) {
  const text = cleanText(content, 500)
  if (!text) return { ok: true }
  try {
    const response = await cloud.openapi.security.msgSecCheck({
      content: text,
      version: 2,
      scene: 2,
      openid
    })
    const suggestion = response.result && response.result.suggest
    return suggestion === 'risky' || suggestion === 'review'
      ? { ok: false, reason: 'content_risky' }
      : { ok: true }
  } catch (error) {
    console.error('msgSecCheck failed', error)
    return { ok: true }
  }
}

async function readDocument(collectionName, documentId, fallback) {
  try {
    return (await db.collection(collectionName).doc(documentId).get()).data
  } catch (error) {
    return fallback
  }
}

async function getWeek(openid, context, dateValue) {
  const date = validDate(dateValue)
  if (!date) return { ok: false, reason: 'invalid_date' }
  const weekStart = weekStartOf(date)
  const documentId = hash(`${context.pairKey}:${weekStart}`)
  const document = await readDocument('weeklyPlans', documentId, null)
  return {
    ok: true,
    paired: context.paired,
    weekStart,
    days: document && Array.isArray(document.days) ? document.days : []
  }
}

async function saveDay(openid, context, event) {
  const date = validDate(event.date)
  if (!date) return { ok: false, reason: 'invalid_date' }
  const menuMap = await getMenuMap(openid, context)
  const dishIds = cleanIds(event.dishIds).filter(id => menuMap.has(id))
  const weekStart = weekStartOf(date)
  const documentId = hash(`${context.pairKey}:${weekStart}`)
  const document = await readDocument('weeklyPlans', documentId, {
    days: []
  })
  const days = (document.days || []).filter(day => day.date !== date)
  if (dishIds.length) {
    days.push({
      date,
      dishIds,
      updatedBy: openid,
      updatedAtValue: Date.now()
    })
  }
  days.sort((first, second) => first.date.localeCompare(second.date))
  if (days.length) {
    await db.collection('weeklyPlans').doc(documentId).set({
      data: {
        pairKey: context.pairKey,
        memberA: context.memberA,
        memberB: context.memberB,
        weekStart,
        days,
        updatedAt: db.serverDate()
      }
    })
  } else {
    try {
      await db.collection('weeklyPlans').doc(documentId).remove()
    } catch (error) {
      // 尚未创建周计划时，无需保留空文档。
    }
  }
  return getWeek(openid, context, date)
}

async function getAccessibleOrders(openid) {
  const [created, received] = await Promise.all([
    db.collection('orders').where({ creatorOpenid: openid }).limit(100).get(),
    db.collection('orders').where({ partnerOpenid: openid }).limit(100).get()
  ])
  const unique = new Map()
  created.data.concat(received.data).forEach(order => unique.set(order._id, order))
  return Array.from(unique.values())
}

function buildRatingSummary(ratings, completedOrders, openid) {
  const myRatingOrderIds = new Set(
    ratings.filter(rating => rating.raterOpenid === openid)
      .map(rating => rating.orderId)
  )
  const dishStats = new Map()
  ratings.forEach(rating => {
    ;(rating.items || []).forEach(item => {
      const current = dishStats.get(item.id) || {
        id: item.id,
        name: item.name,
        icon: item.icon || '🍽️',
        imageUrl: item.imageUrl || '',
        scoreTotal: 0,
        ratingCount: 0
      }
      current.scoreTotal += Number(rating.score || 0)
      current.ratingCount += 1
      dishStats.set(item.id, current)
    })
  })
  const leaderboard = Array.from(dishStats.values())
    .map(item => ({
      id: item.id,
      name: item.name,
      icon: item.icon,
      imageUrl: item.imageUrl,
      averageScore: Math.round((item.scoreTotal / item.ratingCount) * 10) / 10,
      ratingCount: item.ratingCount
    }))
    .sort((first, second) =>
      second.averageScore - first.averageScore ||
      second.ratingCount - first.ratingCount
    )
    .slice(0, 10)

  return {
    ok: true,
    leaderboard,
    pendingOrders: completedOrders
      .filter(order => !myRatingOrderIds.has(order._id))
      .sort((first, second) => Number(second.createdAt || 0) - Number(first.createdAt || 0))
      .slice(0, 20)
      .map(order => ({
        id: order._id,
        creatorNickname: order.creatorNickname || '微信用户',
        createdAt: Number(order.createdAt || 0),
        items: order.items || [],
        total: Number(order.total || 0)
      })),
    ratingCount: ratings.length
  }
}

async function getRatings(openid, context) {
  const [ratingsResult, orders] = await Promise.all([
    db.collection('orderRatings').where({ pairKey: context.pairKey }).limit(100).get(),
    getAccessibleOrders(openid)
  ])
  return buildRatingSummary(
    ratingsResult.data,
    orders.filter(order => order.status === 'completed'),
    openid
  )
}

async function rateOrder(openid, context, event) {
  const orderId = cleanText(event.orderId, 80)
  const score = Math.round(Number(event.score))
  const comment = cleanText(event.comment, 60)
  if (!orderId || score < 1 || score > 5) {
    return { ok: false, reason: 'invalid_rating' }
  }
  let order
  try {
    order = (await db.collection('orders').doc(orderId).get()).data
  } catch (error) {
    return { ok: false, reason: 'order_not_found' }
  }
  if (
    order.creatorOpenid !== openid &&
    order.partnerOpenid !== openid
  ) {
    return { ok: false, reason: 'forbidden' }
  }
  if (order.status !== 'completed') {
    return { ok: false, reason: 'order_not_completed' }
  }
  const safety = await checkTextSafety(openid, comment)
  if (!safety.ok) return safety
  const documentId = hash(`${orderId}:${openid}`)
  await db.collection('orderRatings').doc(documentId).set({
    data: {
      pairKey: context.pairKey,
      memberA: context.memberA,
      memberB: context.memberB,
      orderId,
      raterOpenid: openid,
      score,
      comment,
      items: (order.items || []).map(item => ({
        id: cleanText(item.id, 80),
        name: cleanText(item.name, 20),
        icon: cleanText(item.icon, 4),
        imageUrl: cleanText(item.imageUrl, 300)
      })),
      createdAtValue: Date.now(),
      updatedAt: db.serverDate()
    }
  })
  return getRatings(openid, context)
}

function publicOccasion(occasion, openid) {
  const own = occasion.creatorOpenid === openid
  const locked = occasion.type === 'surprise' &&
    !own &&
    Number(occasion.revealAt || 0) > Date.now()
  if (locked) {
    return {
      id: occasion._id,
      type: 'surprise',
      title: '有一份惊喜晚餐',
      date: occasion.date,
      revealAt: occasion.revealAt,
      locked: true,
      own: false,
      dishIds: []
    }
  }
  return {
    id: occasion._id,
    type: occasion.type,
    title: occasion.title,
    date: occasion.date,
    revealAt: Number(occasion.revealAt || 0),
    locked: false,
    own,
    dishIds: occasion.dishIds || []
  }
}

async function listOccasions(openid, context) {
  const result = await db.collection('occasions')
    .where({ pairKey: context.pairKey })
    .limit(100)
    .get()
  return {
    ok: true,
    paired: context.paired,
    occasions: result.data
      .sort((first, second) => String(first.date).localeCompare(String(second.date)))
      .map(occasion => publicOccasion(occasion, openid))
  }
}

async function saveOccasion(openid, context, event) {
  if (!context.paired) return { ok: false, reason: 'partner_required' }
  const type = event.type === 'surprise' ? 'surprise' : 'anniversary'
  const title = cleanText(event.title, 20)
  const date = validDate(event.date)
  const revealAt = type === 'surprise' ? Number(event.revealAt) : 0
  if (!title || !date) return { ok: false, reason: 'invalid_occasion' }
  if (
    type === 'surprise' &&
    (!Number.isFinite(revealAt) || revealAt <= Date.now())
  ) {
    return { ok: false, reason: 'invalid_reveal_time' }
  }
  const safety = await checkTextSafety(openid, title)
  if (!safety.ok) return safety
  const menuMap = await getMenuMap(openid, context)
  const dishIds = cleanIds(event.dishIds).filter(id => menuMap.has(id))
  if (!dishIds.length) return { ok: false, reason: 'menu_required' }
  const documentId = hash(`${context.pairKey}:${Date.now()}:${Math.random()}`)
  await db.collection('occasions').doc(documentId).set({
    data: {
      pairKey: context.pairKey,
      memberA: context.memberA,
      memberB: context.memberB,
      creatorOpenid: openid,
      type,
      title,
      date,
      revealAt,
      dishIds,
      createdAtValue: Date.now(),
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })
  return listOccasions(openid, context)
}

async function deleteOccasion(openid, context, event) {
  const occasionId = cleanText(event.occasionId, 80)
  let occasion
  try {
    occasion = (await db.collection('occasions').doc(occasionId).get()).data
  } catch (error) {
    return { ok: false, reason: 'occasion_not_found' }
  }
  if (
    occasion.pairKey !== context.pairKey ||
    occasion.creatorOpenid !== openid
  ) {
    return { ok: false, reason: 'forbidden' }
  }
  await db.collection('occasions').doc(occasionId).remove()
  return listOccasions(openid, context)
}

exports.main = async event => {
  await ensureCollections()
  const { OPENID } = cloud.getWXContext()
  const action = event.action || 'getWeek'
  const context = await getContext(OPENID)
  if (!context.ok) return context

  if (action === 'getWeek') {
    return getWeek(OPENID, context, event.date)
  }
  if (action === 'saveDay') {
    return saveDay(OPENID, context, event)
  }
  if (action === 'getRatings') {
    return getRatings(OPENID, context)
  }
  if (action === 'rateOrder') {
    return rateOrder(OPENID, context, event)
  }
  if (action === 'listOccasions') {
    return listOccasions(OPENID, context)
  }
  if (action === 'saveOccasion') {
    return saveOccasion(OPENID, context, event)
  }
  if (action === 'deleteOccasion') {
    return deleteOccasion(OPENID, context, event)
  }
  return { ok: false, reason: 'unknown_action' }
}
