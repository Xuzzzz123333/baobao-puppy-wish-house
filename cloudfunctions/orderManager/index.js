const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const STATUS_FLOW = ['confirmed', 'accepted', 'preparing', 'ready', 'completed']
let collectionsReady = null

function ensureCollections() {
  if (!collectionsReady) {
    collectionsReady = Promise.all(
      ['users', 'orders', 'orderRatings', 'shoppingLists'].map(async name => {
        try {
          await db.createCollection(name)
        } catch (error) {
          // 集合已存在时会报错，后续读写仍会返回真实错误。
        }
      })
    )
  }
  return collectionsReady
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function cleanItems(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 30).map(item => ({
    id: cleanText(item.id, 80),
    name: cleanText(item.name, 20),
    quantity: Math.max(1, Math.min(20, Number(item.quantity) || 1)),
    price: Math.max(0, Math.min(99999, Number(item.price) || 0)),
    icon: cleanText(item.icon, 4),
    imageUrl: cleanText(item.imageUrl, 300)
  })).filter(item => item.id && item.name)
}

async function getUser(openid) {
  if (!openid) return null
  try {
    return (await db.collection('users').doc(openid).get()).data
  } catch (error) {
    return null
  }
}

function canManageOrder(order, openid, me) {
  if (!me || me.role !== 'chef') return false
  if (order.chefOpenid) return order.chefOpenid === openid
  return order.creatorOpenid === openid || order.partnerOpenid === openid
}

function publicOrder(order, openid, me) {
  return {
    id: order._id,
    creatorNickname: order.creatorNickname || '微信用户',
    items: order.items || [],
    notes: order.notes || [],
    total: Number(order.total || 0),
    expectedDinnerTime: order.expectedDinnerTime || '19:00',
    createdAt: Number(order.createdAt || 0),
    updatedAt: Number(order.updatedAtValue || order.createdAt || 0),
    status: STATUS_FLOW.includes(order.status) ? order.status : 'confirmed',
    createdByMe: order.creatorOpenid === openid,
    canManage: canManageOrder(order, openid, me)
  }
}

async function getVisibleOrders(openid, me) {
  const [created, received] = await Promise.all([
    db.collection('orders').where({ creatorOpenid: openid }).limit(100).get(),
    db.collection('orders').where({ partnerOpenid: openid }).limit(100).get()
  ])
  const unique = new Map()
  created.data.concat(received.data).forEach(order => unique.set(order._id, order))
  return Array.from(unique.values())
    .filter(order => !(order.hiddenFor || []).includes(openid))
    .sort((first, second) => Number(second.createdAt || 0) - Number(first.createdAt || 0))
    .slice(0, 100)
    .map(order => publicOrder(order, openid, me))
}

function buildStats(orders) {
  const dishFrequency = {}
  orders.forEach(order => {
    ;(order.items || []).forEach(item => {
      dishFrequency[item.id] = (dishFrequency[item.id] || 0) + Number(item.quantity || 1)
    })
  })
  const favoriteDishIds = Object.keys(dishFrequency)
    .sort((first, second) => dishFrequency[second] - dishFrequency[first])
    .slice(0, 5)
  return {
    orderCount: orders.length,
    completedCount: orders.filter(order => order.status === 'completed').length,
    favoriteDishIds,
    dishFrequency
  }
}

async function deleteRatingsForOrder(orderId) {
  const result = await db.collection('orderRatings')
    .where({ orderId })
    .limit(100)
    .get()
  await Promise.all(result.data.map(rating =>
    db.collection('orderRatings').doc(rating._id).remove()
  ))
}

async function deleteShoppingListsForOrder(orderId) {
  const result = await db.collection('shoppingLists')
    .where({ orderId })
    .limit(100)
    .get()
  await Promise.all(result.data.map(list =>
    db.collection('shoppingLists').doc(list._id).remove()
  ))
}

exports.main = async event => {
  await ensureCollections()
  const { OPENID } = cloud.getWXContext()
  const action = event.action || 'list'
  const me = await getUser(OPENID)
  if (!me) return { ok: false, reason: 'account_not_found' }

  if (action === 'save') {
    const items = cleanItems(event.order && event.order.items)
    if (!items.length) return { ok: false, reason: 'empty_order' }
    const orderId = `ORDER-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`
    const notes = Array.isArray(event.order.notes)
      ? event.order.notes.map(note => cleanText(note, 20)).filter(Boolean).slice(0, 8)
      : []
    const total = Math.max(0, Math.min(999999, Number(event.order.total) || 0))
    const createdAt = Date.now()
    const expectedDinnerTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(
      cleanText(event.order.expectedDinnerTime, 5)
    )
      ? cleanText(event.order.expectedDinnerTime, 5)
      : '19:00'
    const partner = await getUser(me.partnerOpenid)
    const chefOpenid = me.role === 'chef'
      ? OPENID
      : (partner && partner.role === 'chef' ? me.partnerOpenid : '')
    const dinerOpenid = me.role === 'diner'
      ? OPENID
      : (partner && partner.role === 'diner' ? me.partnerOpenid : '')
    const orderData = {
      creatorOpenid: OPENID,
      creatorNickname: me.nickname || '微信用户',
      partnerOpenid: me.partnerOpenid || '',
      chefOpenid,
      dinerOpenid,
      items,
      notes,
      total,
      expectedDinnerTime,
      status: 'confirmed',
      hiddenFor: [],
      createdAt,
      updatedAtValue: createdAt,
      createdAtServer: db.serverDate(),
      updatedAt: db.serverDate()
    }
    await db.collection('orders').doc(orderId).set({ data: orderData })
    return {
      ok: true,
      order: publicOrder({ _id: orderId, ...orderData }, OPENID, me)
    }
  }

  if (action === 'list') {
    const orders = await getVisibleOrders(OPENID, me)
    return {
      ok: true,
      canManage: me.role === 'chef',
      orders,
      stats: buildStats(orders)
    }
  }

  if (action === 'updateStatus') {
    const orderId = cleanText(event.orderId, 80)
    const nextStatus = cleanText(event.status, 20)
    if (!orderId || !STATUS_FLOW.includes(nextStatus)) {
      return { ok: false, reason: 'invalid_status' }
    }
    let order
    try {
      order = (await db.collection('orders').doc(orderId).get()).data
    } catch (error) {
      return { ok: false, reason: 'order_not_found' }
    }
    if (!canManageOrder(order, OPENID, me)) {
      return { ok: false, reason: 'forbidden' }
    }
    const currentStatus = STATUS_FLOW.includes(order.status) ? order.status : 'confirmed'
    const currentIndex = STATUS_FLOW.indexOf(currentStatus)
    const nextIndex = STATUS_FLOW.indexOf(nextStatus)
    if (nextIndex !== currentIndex + 1) {
      return {
        ok: false,
        reason: nextIndex === currentIndex ? 'status_unchanged' : 'invalid_transition'
      }
    }
    const updatedAtValue = Date.now()
    await db.collection('orders').doc(orderId).update({
      data: {
        status: nextStatus,
        updatedAtValue,
        updatedAt: db.serverDate()
      }
    })
    return {
      ok: true,
      order: publicOrder(
        { _id: orderId, ...order, status: nextStatus, updatedAtValue },
        OPENID,
        me
      )
    }
  }

  if (action === 'clearHistory') {
    const [created, received] = await Promise.all([
      db.collection('orders').where({ creatorOpenid: OPENID }).limit(100).get(),
      db.collection('orders').where({ partnerOpenid: OPENID }).limit(100).get()
    ])
    const unique = new Map()
    created.data.concat(received.data).forEach(order => unique.set(order._id, order))
    await Promise.all(Array.from(unique.values()).map(async order => {
      await deleteRatingsForOrder(order._id)
      await deleteShoppingListsForOrder(order._id)
      await db.collection('orders').doc(order._id).remove()
    }))
    return { ok: true, cleared: unique.size }
  }

  if (action === 'delete') {
    const orderId = cleanText(event.orderId, 80)
    if (!orderId) return { ok: false, reason: 'order_not_found' }
    try {
      const order = (await db.collection('orders').doc(orderId).get()).data
      if (order.creatorOpenid !== OPENID) {
        return { ok: false, reason: 'forbidden' }
      }
      await deleteRatingsForOrder(orderId)
      await deleteShoppingListsForOrder(orderId)
      await db.collection('orders').doc(orderId).remove()
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: 'order_not_found' }
    }
  }

  return { ok: false, reason: 'unknown_action' }
}
