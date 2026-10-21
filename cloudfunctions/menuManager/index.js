const crypto = require('crypto')
const cloud = require('wx-server-sdk')
const defaultDishes = require('./seed')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const categories = ['热菜', '主食', '轻食', '甜品', '饮品']
const ingredientCategories = ['蔬菜', '肉禽蛋', '水产', '主食', '调味料', '饮品', '其他']
const ingredientUnits = ['g', 'kg', 'ml', 'L', '个', '颗', '根', '把', '盒', '袋', '瓶', '适量']
const INGREDIENTS_VERSION = 1
let collectionsReady = null

function ensureCollections() {
  if (!collectionsReady) {
    collectionsReady = Promise.all(
      ['users', 'dishes'].map(async name => {
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

function cleanList(value, fallback) {
  if (!Array.isArray(value)) return fallback || []
  return value
    .map(item => cleanText(item, 10))
    .filter(Boolean)
    .slice(0, 4)
}

function cleanPrice(value) {
  const price = Number(value)
  if (!Number.isFinite(price) || price < 0 || price > 99999) return null
  return Math.round(price * 100) / 100
}

function cleanImageUrl(value) {
  const url = cleanText(value, 300)
  return !url || url.startsWith('cloud://') ? url : ''
}

function sanitizeIngredients(value, fallback) {
  const source = Array.isArray(value)
    ? value
    : (Array.isArray(fallback) ? fallback : [])
  return source.slice(0, 20).map((item, index) => {
    const name = cleanText(item && item.name, 16)
    if (!name) return null
    const unit = ingredientUnits.includes(item.unit) ? item.unit : 'g'
    const rawQuantity = Number(item.quantity)
    const quantity = unit === '适量'
      ? 0
      : Math.round(Math.max(0.01, Math.min(99999, rawQuantity || 1)) * 100) / 100
    return {
      id: cleanText(item.id, 40) || `ingredient-${index + 1}`,
      name,
      category: ingredientCategories.includes(item.category) ? item.category : '其他',
      quantity,
      unit,
      optional: item.optional === true,
      note: cleanText(item.note, 30)
    }
  }).filter(Boolean)
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

function sanitizeDish(source, existing) {
  const base = existing || {}
  const name = cleanText(source.name !== undefined ? source.name : base.name, 20)
  const price = cleanPrice(source.price !== undefined ? source.price : base.price)
  if (!name) return { ok: false, reason: 'name_required' }
  if (price === null) return { ok: false, reason: 'invalid_price' }

  const categoryValue = source.category !== undefined ? source.category : base.category
  const category = categories.includes(categoryValue) ? categoryValue : '热菜'
  const toneValue = cleanText(source.tone !== undefined ? source.tone : base.tone, 7)
  const tone = /^#[0-9a-fA-F]{6}$/.test(toneValue) ? toneValue : '#F4CFC3'

  return {
    ok: true,
    dish: {
      name,
      subtitle: cleanText(
        source.subtitle !== undefined ? source.subtitle : base.subtitle,
        40
      ) || '大厨今天准备的好味道',
      category,
      price,
      icon: cleanText(source.icon !== undefined ? source.icon : base.icon, 4) || '🍽️',
      imageUrl: cleanImageUrl(
        source.imageUrl !== undefined ? source.imageUrl : base.imageUrl
      ),
      tone,
      tags: cleanList(
        source.tags !== undefined ? source.tags : base.tags,
        ['今日推荐']
      ),
      moods: cleanList(
        source.moods !== undefined ? source.moods : base.moods,
        ['温暖点']
      ),
      time: cleanText(source.time !== undefined ? source.time : base.time, 10) || '20 分钟',
      available: source.available !== undefined
        ? source.available === true
        : base.available !== false,
      ingredients: sanitizeIngredients(
        source.ingredients !== undefined ? source.ingredients : base.ingredients,
        base.ingredients
      ),
      match: Math.max(0, Math.min(100, Number(
        source.match !== undefined ? source.match : (base.match || 80)
      ) || 80))
    }
  }
}

async function getUser(openid) {
  try {
    return (await db.collection('users').doc(openid).get()).data
  } catch (error) {
    return null
  }
}

async function resolveChef(openid) {
  const me = await getUser(openid)
  if (!me || !['chef', 'diner'].includes(me.role)) {
    return { ok: false, reason: 'role_required' }
  }
  if (me.role === 'chef') {
    return { ok: true, chefOpenid: openid, canManage: true }
  }
  if (!me.partnerOpenid) {
    return { ok: false, reason: 'partner_not_found' }
  }
  const partner = await getUser(me.partnerOpenid)
  if (!partner || partner.role !== 'chef') {
    return { ok: false, reason: 'chef_not_found' }
  }
  return { ok: true, chefOpenid: me.partnerOpenid, canManage: false }
}

function seedDocumentId(chefOpenid, dishId) {
  return crypto
    .createHash('sha1')
    .update(`${chefOpenid}:${dishId}`)
    .digest('hex')
    .slice(0, 24)
}

async function ensureSeedMenu(chefOpenid) {
  const chef = await getUser(chefOpenid)
  if (
    chef &&
    chef.menuInitialized === true &&
    Number(chef.menuIngredientsVersion || 0) >= INGREDIENTS_VERSION
  ) return

  const current = await db.collection('dishes')
    .where({ chefOpenid })
    .limit(100)
    .get()

  if (!current.data.length) {
    await Promise.all(defaultDishes.map((dish, index) =>
      db.collection('dishes').doc(seedDocumentId(chefOpenid, dish.id)).set({
        data: {
          ...dish,
          dishId: dish.id,
          chefOpenid,
          sortOrder: index,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      })
    ))
  } else {
    const seedMap = new Map(defaultDishes.map(dish => [dish.id, dish]))
    await Promise.all(current.data.map(document => {
      if (Array.isArray(document.ingredients)) return Promise.resolve()
      const seedDish = seedMap.get(document.dishId)
      if (!seedDish || !Array.isArray(seedDish.ingredients)) return Promise.resolve()
      return db.collection('dishes').doc(document._id).update({
        data: {
          ingredients: sanitizeIngredients(seedDish.ingredients),
          updatedAt: db.serverDate()
        }
      })
    }))
  }

  await db.collection('users').doc(chefOpenid).update({
    data: {
      menuInitialized: true,
      menuIngredientsVersion: INGREDIENTS_VERSION,
      updatedAt: db.serverDate()
    }
  })
}

function toPublicDish(document) {
  return {
    id: document.dishId,
    name: document.name,
    subtitle: document.subtitle,
    category: document.category,
    price: document.price,
    icon: document.icon,
    imageUrl: document.imageUrl || '',
    tone: document.tone,
    tags: document.tags || [],
    moods: document.moods || [],
    time: document.time,
    available: document.available !== false,
    ingredients: sanitizeIngredients(document.ingredients),
    match: document.match
  }
}

async function listDishes(chefOpenid) {
  await ensureSeedMenu(chefOpenid)
  const result = await db.collection('dishes')
    .where({ chefOpenid })
    .limit(100)
    .get()
  return result.data
    .sort((first, second) => (first.sortOrder || 0) - (second.sortOrder || 0))
}

async function findDish(chefOpenid, dishId) {
  const result = await db.collection('dishes')
    .where({ chefOpenid })
    .limit(100)
    .get()
  return result.data.find(item => item.dishId === dishId) || null
}

exports.main = async event => {
  await ensureCollections()
  const { OPENID } = cloud.getWXContext()
  const action = event.action || 'list'
  const access = await resolveChef(OPENID)
  if (!access.ok) return access

  if (action === 'list') {
    const dishes = await listDishes(access.chefOpenid)
    return {
      ok: true,
      canManage: access.canManage,
      expectedDinnerTime: cleanText(
        (await getUser(access.chefOpenid)).expectedDinnerTime,
        5
      ) || '19:00',
      dishes: dishes.map(toPublicDish)
    }
  }

  if (!access.canManage) {
    return { ok: false, reason: 'forbidden' }
  }

  await ensureSeedMenu(OPENID)

  if (action === 'updateSettings') {
    const expectedDinnerTime = cleanText(event.expectedDinnerTime, 5)
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(expectedDinnerTime)) {
      return { ok: false, reason: 'invalid_time' }
    }
    await db.collection('users').doc(OPENID).update({
      data: {
        expectedDinnerTime,
        updatedAt: db.serverDate()
      }
    })
    return { ok: true, expectedDinnerTime }
  }

  if (action === 'reorder') {
    const dishIds = Array.isArray(event.dishIds)
      ? event.dishIds.map(id => cleanText(id, 80)).filter(Boolean).slice(0, 100)
      : []
    const current = await listDishes(OPENID)
    const currentIds = current.map(item => item.dishId)
    if (
      dishIds.length !== currentIds.length ||
      currentIds.some(id => !dishIds.includes(id))
    ) {
      return { ok: false, reason: 'invalid_order' }
    }
    await Promise.all(dishIds.map(async (dishId, index) => {
      const dish = current.find(item => item.dishId === dishId)
      await db.collection('dishes').doc(dish._id).update({
        data: {
          sortOrder: index,
          updatedAt: db.serverDate()
        }
      })
    }))
    return { ok: true }
  }

  if (action === 'create') {
    const sanitized = sanitizeDish(event.dish || {}, null)
    if (!sanitized.ok) return sanitized
    const safety = await checkTextSafety(
      OPENID,
      [
        sanitized.dish.name,
        sanitized.dish.subtitle,
        sanitized.dish.tags.join(' '),
        sanitized.dish.ingredients
          .map(item => `${item.name} ${item.note}`)
          .join(' ')
      ].join(' ')
    )
    if (!safety.ok) return safety
    const dishId = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    await db.collection('dishes').add({
      data: {
        ...sanitized.dish,
        dishId,
        chefOpenid: OPENID,
        sortOrder: Date.now(),
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    })
    return { ok: true, dish: { id: dishId, ...sanitized.dish } }
  }

  const dishId = cleanText(event.dishId, 80)
  const existing = await findDish(OPENID, dishId)
  if (!existing) return { ok: false, reason: 'dish_not_found' }

  if (action === 'update') {
    const sanitized = sanitizeDish(event.dish || {}, existing)
    if (!sanitized.ok) return sanitized
    const safety = await checkTextSafety(
      OPENID,
      [
        sanitized.dish.name,
        sanitized.dish.subtitle,
        sanitized.dish.tags.join(' '),
        sanitized.dish.ingredients
          .map(item => `${item.name} ${item.note}`)
          .join(' ')
      ].join(' ')
    )
    if (!safety.ok) return safety
    await db.collection('dishes').doc(existing._id).update({
      data: {
        ...sanitized.dish,
        updatedAt: db.serverDate()
      }
    })
    return { ok: true, dish: { id: dishId, ...sanitized.dish } }
  }

  if (action === 'delete') {
    await db.collection('dishes').doc(existing._id).remove()
    return { ok: true }
  }

  return { ok: false, reason: 'unknown_action' }
}
