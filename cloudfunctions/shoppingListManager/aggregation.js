const CATEGORY_ORDER = ['蔬菜', '肉禽蛋', '水产', '主食', '调味料', '饮品', '其他']
const UNITS = ['g', 'kg', 'ml', 'L', '个', '颗', '根', '把', '盒', '袋', '瓶', '适量']
const STATES = ['pending', 'pantry', 'purchased']

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function roundQuantity(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function mergeKey(name, unit) {
  return `${cleanText(name, 24).replace(/\s+/g, '').toLowerCase()}::${unit}`
}

function hashKey(value) {
  let hash = 5381
  String(value).split('').forEach(character => {
    hash = ((hash << 5) + hash) ^ character.charCodeAt(0)
  })
  return (hash >>> 0).toString(36)
}

function normalizeListItem(value, defaults) {
  const source = value || {}
  const base = defaults || {}
  const name = cleanText(source.name !== undefined ? source.name : base.name, 24)
  if (!name) return null
  const unitValue = source.unit !== undefined ? source.unit : base.unit
  const unit = UNITS.includes(unitValue) ? unitValue : '个'
  const rawQuantity = source.quantity !== undefined ? source.quantity : base.quantity
  const quantity = unit === '适量'
    ? 0
    : roundQuantity(Math.max(0.01, Math.min(99999, Number(rawQuantity) || 1)))
  const categoryValue = source.category !== undefined ? source.category : base.category
  const stateValue = source.state !== undefined ? source.state : base.state
  const itemSource = source.source === 'generated' || base.source === 'generated'
    ? 'generated'
    : 'manual'
  const key = mergeKey(name, unit)
  return {
    id: cleanText(source.id || base.id, 60) ||
      `${itemSource}-${hashKey(`${key}:${Date.now()}:${Math.random()}`)}`,
    mergeKey: key,
    name,
    category: CATEGORY_ORDER.includes(categoryValue) ? categoryValue : '其他',
    quantity,
    unit,
    state: STATES.includes(stateValue) ? stateValue : 'pending',
    source: itemSource,
    optional: source.optional === true || base.optional === true,
    note: cleanText(source.note !== undefined ? source.note : base.note, 40),
    sources: Array.isArray(source.sources || base.sources)
      ? (source.sources || base.sources).slice(0, 20).map(item => ({
        dishId: cleanText(item.dishId, 80),
        dishName: cleanText(item.dishName, 24)
      })).filter(item => item.dishId && item.dishName)
      : []
  }
}

function aggregateOrderIngredients(orderItems, dishes) {
  const dishMap = new Map(
    (Array.isArray(dishes) ? dishes : []).map(dish => [dish.dishId || dish.id, dish])
  )
  const merged = new Map()
  const missingDishes = []

  ;(Array.isArray(orderItems) ? orderItems : []).forEach(orderItem => {
    const dish = dishMap.get(orderItem.id)
    const orderQuantity = Math.max(1, Math.min(20, Number(orderItem.quantity) || 1))
    if (!dish || !Array.isArray(dish.ingredients) || !dish.ingredients.length) {
      missingDishes.push({
        id: cleanText(orderItem.id, 80),
        name: cleanText(orderItem.name, 24) || '未命名菜品'
      })
      return
    }

    dish.ingredients.forEach(ingredient => {
      const normalized = normalizeListItem({
        ...ingredient,
        source: 'generated',
        state: 'pending'
      })
      if (!normalized) return
      const key = normalized.mergeKey
      const current = merged.get(key)
      const quantity = normalized.unit === '适量'
        ? 0
        : roundQuantity(normalized.quantity * orderQuantity)
      const source = {
        dishId: cleanText(orderItem.id, 80),
        dishName: cleanText(orderItem.name || dish.name, 24)
      }
      if (current) {
        current.quantity = current.unit === '适量'
          ? 0
          : roundQuantity(current.quantity + quantity)
        current.optional = current.optional && normalized.optional
        if (!current.sources.some(item => item.dishId === source.dishId)) {
          current.sources.push(source)
        }
        if (normalized.note && !current.note.includes(normalized.note)) {
          current.note = cleanText(
            [current.note, normalized.note].filter(Boolean).join('；'),
            40
          )
        }
        return
      }
      merged.set(key, {
        ...normalized,
        id: `generated-${hashKey(key)}`,
        quantity,
        sources: [source]
      })
    })
  })

  const items = Array.from(merged.values()).sort((first, second) => {
    const categoryDelta = CATEGORY_ORDER.indexOf(first.category) -
      CATEGORY_ORDER.indexOf(second.category)
    return categoryDelta || first.name.localeCompare(second.name, 'zh-CN')
  })

  return {
    items,
    missingDishes: Array.from(
      new Map(missingDishes.map(item => [item.id, item])).values()
    )
  }
}

module.exports = {
  CATEGORY_ORDER,
  UNITS,
  STATES,
  cleanText,
  mergeKey,
  normalizeListItem,
  aggregateOrderIngredients
}
