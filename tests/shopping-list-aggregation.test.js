const assert = require('assert')
const {
  aggregateOrderIngredients,
  normalizeListItem
} = require('../cloudfunctions/shoppingListManager/aggregation')

const dishes = [
  {
    dishId: 'dish-a',
    ingredients: [
      { name: '番茄', category: '蔬菜', quantity: 2, unit: '个' },
      { name: '盐', category: '调味料', quantity: 0, unit: '适量', optional: true }
    ]
  },
  {
    dishId: 'dish-b',
    ingredients: [
      { name: '番茄', category: '蔬菜', quantity: 1, unit: '个' },
      { name: '番茄', category: '蔬菜', quantity: 500, unit: 'g' },
      { name: '盐', category: '调味料', quantity: 0, unit: '适量', optional: false }
    ]
  }
]

const result = aggregateOrderIngredients([
  { id: 'dish-a', name: '番茄炒蛋', quantity: 2 },
  { id: 'dish-b', name: '番茄牛腩', quantity: 1 },
  { id: 'missing', name: '未配置的菜', quantity: 1 }
], dishes)

assert.strictEqual(result.items.find(item => item.mergeKey === '番茄::个').quantity, 5)
assert.strictEqual(result.items.find(item => item.mergeKey === '番茄::g').quantity, 500)
assert.strictEqual(result.items.find(item => item.mergeKey === '盐::适量').quantity, 0)
assert.strictEqual(result.items.find(item => item.mergeKey === '盐::适量').optional, false)
assert.deepStrictEqual(result.missingDishes, [{ id: 'missing', name: '未配置的菜' }])

const manual = normalizeListItem({
  name: '牛奶',
  category: '饮品',
  quantity: 2,
  unit: '盒',
  source: 'manual'
})
assert.strictEqual(manual.name, '牛奶')
assert.strictEqual(manual.quantity, 2)
assert.strictEqual(manual.state, 'pending')
assert.strictEqual(manual.source, 'manual')

console.log('shopping-list aggregation tests passed')
