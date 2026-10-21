const crypto = require('crypto')
const cloud = require('wx-server-sdk')
const {
  CATEGORY_ORDER,
  UNITS,
  STATES,
  cleanText,
  normalizeListItem,
  aggregateOrderIngredients
} = require('./aggregation')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
let collectionsReady = null

function ensureCollections() {
  if (!collectionsReady) {
    collectionsReady = Promise.all(
      ['users', 'orders', 'dishes', 'shoppingLists'].map(async name => {
        try {
          await db.createCollection(name)
        } catch (error) {
          // 集合已存在时会报错；后续读写仍会返回真实错误。
        }
      })
    )
  }
  return collectionsReady
}

function hash(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 24)
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
  if (!me.partnerOpenid) {
    return { ok: false, reason: 'partner_required', paired: false }
  }
  const partner = await getUser(me.partnerOpenid)
  if (!partner || partner.partnerOpenid !== openid) {
    return { ok: false, reason: 'partner_required', paired: false }
  }
  const members = [openid, me.partnerOpenid].sort()
  return {
    ok: true,
    paired: true,
    openid,
    me,
    partner,
    memberA: members[0],
    memberB: members[1],
    pairKey: hash(members.join(':')),
    documentId: hash(`shopping-list:${members.join(':')}`)
  }
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

async function readList(documentId) {
  try {
    return (await db.collection('shoppingLists').doc(documentId).get()).data
  } catch (error) {
    return null
  }
}

function publicList(document) {
  if (!document) return null
  return {
    id: document._id,
    orderId: cleanText(document.orderId, 80),
    title: cleanText(document.title, 30) || '今晚采购',
    expectedDinnerTime: cleanText(document.expectedDinnerTime, 5) || '19:00',
    orderCreatedAt: Number(document.orderCreatedAt || 0),
    updatedAt: Number(document.updatedAtValue || 0),
    missingDishes: Array.isArray(document.missingDishes)
      ? document.missingDishes.slice(0, 30).map(item => ({
        id: cleanText(item.id, 80),
        name: cleanText(item.name, 24)
      }))
      : [],
    items: (Array.isArray(document.items) ? document.items : [])
      .map(item => normalizeListItem(item))
      .filter(Boolean)
  }
}

function canAccessOrder(order, context) {
  const members = [order.creatorOpenid, order.partnerOpenid].filter(Boolean).sort()
  return members.length === 2 &&
    members[0] === context.memberA &&
    members[1] === context.memberB
}

async function readOrder(orderId, context) {
  let order
  try {
    order = (await db.collection('orders').doc(orderId).get()).data
  } catch (error) {
    return { ok: false, reason: 'order_not_found' }
  }
  if (!canAccessOrder(order, context)) {
    return { ok: false, reason: 'forbidden' }
  }
  return { ok: true, order }
}

function chefOpenidFor(order, context) {
  if (order.chefOpenid) return order.chefOpenid
  if (context.me.role === 'chef') return context.openid
  if (context.partner && context.partner.role === 'chef') {
    return context.me.partnerOpenid
  }
  return ''
}

async function getChefDishes(chefOpenid) {
  if (!chefOpenid) return []
  const result = await db.collection('dishes')
    .where({ chefOpenid })
    .limit(100)
    .get()
  return result.data
}

async function getList(context) {
  const document = await readList(context.documentId)
  if (document && document.pairKey !== context.pairKey) {
    return { ok: false, reason: 'forbidden' }
  }
  return {
    ok: true,
    paired: true,
    categories: CATEGORY_ORDER,
    units: UNITS,
    states: STATES,
    list: publicList(document)
  }
}

async function generateList(openid, context, event) {
  const orderId = cleanText(event.orderId, 80)
  if (!orderId) return { ok: false, reason: 'order_required' }
  const orderResult = await readOrder(orderId, context)
  if (!orderResult.ok) return orderResult
  const order = orderResult.order
  const dishes = await getChefDishes(chefOpenidFor(order, context))
  const generated = aggregateOrderIngredients(order.items, dishes)
  const existing = await readList(context.documentId)
  const sameOrder = Boolean(existing && existing.orderId === orderId)
  const existingGenerated = new Map(
    (sameOrder ? (existing.items || []) : [])
      .filter(item => item.source === 'generated')
      .map(item => [item.mergeKey, item])
  )
  const manualItems = (sameOrder ? (existing.items || []) : [])
    .filter(item => item.source === 'manual')
    .map(item => normalizeListItem(item))
    .filter(Boolean)
  const generatedItems = generated.items.map(item => {
    const previous = existingGenerated.get(item.mergeKey)
    return normalizeListItem({
      ...item,
      state: previous && STATES.includes(previous.state) ? previous.state : 'pending',
      note: previous && previous.note ? previous.note : item.note
    })
  })
  const updatedAtValue = Date.now()
  await db.collection('shoppingLists').doc(context.documentId).set({
    data: {
      pairKey: context.pairKey,
      memberA: context.memberA,
      memberB: context.memberB,
      orderId,
      title: '今晚采购',
      expectedDinnerTime: cleanText(order.expectedDinnerTime, 5) || '19:00',
      orderCreatedAt: Number(order.createdAt || 0),
      missingDishes: generated.missingDishes,
      items: generatedItems.concat(manualItems),
      updatedBy: openid,
      updatedAtValue,
      createdAt: existing && existing.createdAt ? existing.createdAt : db.serverDate(),
      updatedAt: db.serverDate()
    }
  })
  return getList(context)
}

async function mutateList(context, openid, mutator) {
  let failure = null
  await db.runTransaction(async transaction => {
    const collection = transaction.collection('shoppingLists')
    let document
    try {
      document = (await collection.doc(context.documentId).get()).data
    } catch (error) {
      failure = { ok: false, reason: 'list_not_found' }
      return
    }
    if (!document || document.pairKey !== context.pairKey) {
      failure = { ok: false, reason: 'forbidden' }
      return
    }
    const result = mutator((document.items || []).map(item => ({ ...item })))
    if (!result.ok) {
      failure = result
      return
    }
    await collection.doc(context.documentId).update({
      data: {
        items: result.items,
        updatedBy: openid,
        updatedAtValue: Date.now(),
        updatedAt: db.serverDate()
      }
    })
  })
  return failure || getList(context)
}

async function addItem(openid, context, event) {
  const item = normalizeListItem({
    ...(event.item || {}),
    id: `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'manual',
    state: 'pending',
    sources: []
  })
  if (!item) return { ok: false, reason: 'name_required' }
  const safety = await checkTextSafety(openid, `${item.name} ${item.note}`)
  if (!safety.ok) return safety
  return mutateList(context, openid, items => {
    if (items.length >= 100) return { ok: false, reason: 'list_full' }
    return { ok: true, items: items.concat(item) }
  })
}

async function updateItem(openid, context, event) {
  const itemId = cleanText(event.itemId, 60)
  if (!itemId) return { ok: false, reason: 'item_not_found' }
  const patch = event.item || {}
  const safety = await checkTextSafety(
    openid,
    `${cleanText(patch.name, 24)} ${cleanText(patch.note, 40)}`
  )
  if (!safety.ok) return safety
  return mutateList(context, openid, items => {
    const index = items.findIndex(item => item.id === itemId)
    if (index < 0) return { ok: false, reason: 'item_not_found' }
    const current = items[index]
    const editablePatch = current.source === 'generated'
      ? {
        quantity: patch.quantity,
        state: patch.state,
        note: patch.note
      }
      : patch
    const updated = normalizeListItem({
      ...current,
      ...Object.fromEntries(
        Object.entries(editablePatch).filter(([, value]) => value !== undefined)
      ),
      id: current.id,
      source: current.source,
      sources: current.sources
    })
    if (!updated) return { ok: false, reason: 'name_required' }
    items[index] = updated
    return { ok: true, items }
  })
}

async function deleteItem(openid, context, event) {
  const itemId = cleanText(event.itemId, 60)
  return mutateList(context, openid, items => {
    const filtered = items.filter(item => item.id !== itemId)
    return filtered.length === items.length
      ? { ok: false, reason: 'item_not_found' }
      : { ok: true, items: filtered }
  })
}

async function markAllPurchased(openid, context) {
  return mutateList(context, openid, items => ({
    ok: true,
    items: items.map(item => ({
      ...item,
      state: item.state === 'pantry' ? 'pantry' : 'purchased'
    }))
  }))
}

async function clearList(context) {
  const document = await readList(context.documentId)
  if (!document) return { ok: true, paired: true, list: null }
  if (document.pairKey !== context.pairKey) return { ok: false, reason: 'forbidden' }
  await db.collection('shoppingLists').doc(context.documentId).remove()
  return { ok: true, paired: true, list: null }
}

exports.main = async event => {
  await ensureCollections()
  const { OPENID } = cloud.getWXContext()
  const context = await getContext(OPENID)
  if (!context.ok) return context
  const action = event.action || 'get'

  if (action === 'get') return getList(context)
  if (action === 'generate') return generateList(OPENID, context, event)
  if (action === 'addItem') return addItem(OPENID, context, event)
  if (action === 'updateItem') return updateItem(OPENID, context, event)
  if (action === 'deleteItem') return deleteItem(OPENID, context, event)
  if (action === 'markAllPurchased') return markAllPurchased(OPENID, context)
  if (action === 'clear') return clearList(context)
  return { ok: false, reason: 'unknown_action' }
}
