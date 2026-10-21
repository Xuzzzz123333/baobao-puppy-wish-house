/*
 * 未连接云环境时使用的示例菜单。ingredients 表示制作一份菜所需食材。
 */
const ingredientsByDish = {
  'tomato-beef': [
    { name: '牛腩', category: '肉禽蛋', quantity: 500, unit: 'g' },
    { name: '番茄', category: '蔬菜', quantity: 3, unit: '个' },
    { name: '洋葱', category: '蔬菜', quantity: 0.5, unit: '个' },
    { name: '生抽', category: '调味料', quantity: 0, unit: '适量' },
    { name: '盐', category: '调味料', quantity: 0, unit: '适量' }
  ],
  'sauerkraut-fish': [
    { name: '鱼片', category: '水产', quantity: 500, unit: 'g' },
    { name: '酸菜', category: '蔬菜', quantity: 200, unit: 'g' },
    { name: '金汤料', category: '调味料', quantity: 1, unit: '袋' },
    { name: '辣椒', category: '蔬菜', quantity: 2, unit: '根', optional: true }
  ],
  'beef-noodle': [
    { name: '牛腱', category: '肉禽蛋', quantity: 250, unit: 'g' },
    { name: '面条', category: '主食', quantity: 300, unit: 'g' },
    { name: '青菜', category: '蔬菜', quantity: 1, unit: '把' },
    { name: '牛骨汤', category: '其他', quantity: 500, unit: 'ml' },
    { name: '香葱', category: '蔬菜', quantity: 2, unit: '根', optional: true }
  ],
  'pineapple-pork': [
    { name: '猪里脊', category: '肉禽蛋', quantity: 300, unit: 'g' },
    { name: '菠萝', category: '蔬菜', quantity: 0.5, unit: '个' },
    { name: '彩椒', category: '蔬菜', quantity: 1, unit: '个' },
    { name: '淀粉', category: '调味料', quantity: 0, unit: '适量' },
    { name: '番茄酱', category: '调味料', quantity: 0, unit: '适量' }
  ],
  'pepper-beef': [
    { name: '牛里脊', category: '肉禽蛋', quantity: 300, unit: 'g' },
    { name: '彩椒', category: '蔬菜', quantity: 2, unit: '个' },
    { name: '洋葱', category: '蔬菜', quantity: 0.5, unit: '个' },
    { name: '黑胡椒', category: '调味料', quantity: 0, unit: '适量' }
  ],
  'chicken-rice': [
    { name: '鸡腿', category: '肉禽蛋', quantity: 2, unit: '个' },
    { name: '大米', category: '主食', quantity: 300, unit: 'g' },
    { name: '鸡蛋', category: '肉禽蛋', quantity: 2, unit: '个' },
    { name: '时蔬', category: '蔬菜', quantity: 300, unit: 'g' }
  ],
  'roast-vegetable': [
    { name: '南瓜', category: '蔬菜', quantity: 300, unit: 'g' },
    { name: '芦笋', category: '蔬菜', quantity: 1, unit: '把' },
    { name: '小番茄', category: '蔬菜', quantity: 200, unit: 'g' },
    { name: '橄榄油', category: '调味料', quantity: 0, unit: '适量' }
  ],
  'shrimp-avocado': [
    { name: '鲜虾', category: '水产', quantity: 250, unit: 'g' },
    { name: '牛油果', category: '蔬菜', quantity: 1, unit: '个' },
    { name: '生菜', category: '蔬菜', quantity: 1, unit: '颗' },
    { name: '柚子醋', category: '调味料', quantity: 0, unit: '适量' }
  ],
  pudding: [
    { name: '牛奶', category: '饮品', quantity: 300, unit: 'ml' },
    { name: '鸡蛋', category: '肉禽蛋', quantity: 3, unit: '个' },
    { name: '细砂糖', category: '调味料', quantity: 60, unit: 'g' },
    { name: '海盐', category: '调味料', quantity: 0, unit: '适量' }
  ],
  'osmanthus-rice': [
    { name: '小圆子', category: '主食', quantity: 300, unit: 'g' },
    { name: '酒酿', category: '其他', quantity: 200, unit: 'g' },
    { name: '桂花蜜', category: '调味料', quantity: 0, unit: '适量' },
    { name: '枸杞', category: '其他', quantity: 10, unit: 'g', optional: true }
  ],
  'lemon-tea': [
    { name: '香水柠檬', category: '蔬菜', quantity: 2, unit: '个' },
    { name: '红茶', category: '饮品', quantity: 500, unit: 'ml' },
    { name: '糖浆', category: '调味料', quantity: 0, unit: '适量' },
    { name: '冰块', category: '其他', quantity: 0, unit: '适量', optional: true }
  ],
  'plum-soda': [
    { name: '青梅汁', category: '饮品', quantity: 100, unit: 'ml' },
    { name: '气泡水', category: '饮品', quantity: 500, unit: 'ml' },
    { name: '青梅', category: '蔬菜', quantity: 4, unit: '颗' },
    { name: '冰块', category: '其他', quantity: 0, unit: '适量', optional: true }
  ]
}

const dishes = [
  {
    id: 'tomato-beef',
    name: '番茄慢炖牛腩',
    subtitle: '酸甜浓郁，配米饭刚刚好',
    category: '热菜',
    price: 48,
    icon: '🍅',
    tone: '#F4CFC3',
    tags: ['下饭', '不辣'],
    moods: ['温暖点', '不吃辣'],
    time: '25 分钟',
    match: 96
  },
  {
    id: 'sauerkraut-fish',
    name: '金汤酸菜鱼',
    subtitle: '鲜香微辣，双人份无刺鱼片',
    category: '热菜',
    price: 68,
    icon: '🐟',
    tone: '#E9DE9D',
    tags: ['招牌', '微辣'],
    moods: ['想吃辣', '来点硬菜'],
    time: '30 分钟',
    match: 94
  },
  {
    id: 'beef-noodle',
    name: '清汤牛肉面',
    subtitle: '清亮汤底，现切牛腱',
    category: '主食',
    price: 32,
    icon: '🍜',
    tone: '#D7E2C4',
    tags: ['暖胃', '清淡'],
    moods: ['温暖点', '不吃辣'],
    time: '18 分钟',
    match: 91
  },
  {
    id: 'pineapple-pork',
    name: '菠萝咕咾肉',
    subtitle: '外酥里嫩，酸甜开胃',
    category: '热菜',
    price: 42,
    icon: '🍍',
    tone: '#F6D98C',
    tags: ['酸甜', '人气'],
    moods: ['来点硬菜', '不吃辣'],
    time: '22 分钟',
    match: 88
  },
  {
    id: 'pepper-beef',
    name: '黑椒牛柳',
    subtitle: '焦香黑椒，彩椒爽脆',
    category: '热菜',
    price: 56,
    icon: '🥩',
    tone: '#D9B79F',
    tags: ['肉食', '推荐'],
    moods: ['来点硬菜'],
    time: '20 分钟',
    match: 86
  },
  {
    id: 'chicken-rice',
    name: '香煎鸡腿饭',
    subtitle: '脆皮鸡腿，溏心蛋和时蔬',
    category: '主食',
    price: 36,
    icon: '🍗',
    tone: '#E9C9A6',
    tags: ['一人食', '饱腹'],
    moods: ['来点硬菜', '温暖点'],
    time: '16 分钟',
    match: 84
  },
  {
    id: 'roast-vegetable',
    name: '香草烤时蔬',
    subtitle: '南瓜、芦笋与小番茄',
    category: '轻食',
    price: 29,
    icon: '🥗',
    tone: '#C8D9B5',
    tags: ['低卡', '清爽'],
    moods: ['吃轻一点', '不吃辣'],
    time: '15 分钟',
    match: 82
  },
  {
    id: 'shrimp-avocado',
    name: '牛油果鲜虾碗',
    subtitle: '高蛋白，柚子油醋汁',
    category: '轻食',
    price: 39,
    icon: '🥑',
    tone: '#BFD6B1',
    tags: ['高蛋白', '轻食'],
    moods: ['吃轻一点'],
    time: '12 分钟',
    match: 80
  },
  {
    id: 'pudding',
    name: '海盐焦糖布丁',
    subtitle: '微苦焦糖，奶香柔滑',
    category: '甜品',
    price: 18,
    icon: '🍮',
    tone: '#EDD2A8',
    tags: ['饭后', '甜度低'],
    moods: ['想吃甜的'],
    time: '即刻',
    match: 93
  },
  {
    id: 'osmanthus-rice',
    name: '桂花酒酿小圆子',
    subtitle: '温热桂香，软糯不腻',
    category: '甜品',
    price: 22,
    icon: '🥣',
    tone: '#E7D8B9',
    tags: ['暖甜', '手作'],
    moods: ['想吃甜的', '温暖点'],
    time: '10 分钟',
    match: 87
  },
  {
    id: 'lemon-tea',
    name: '手打香水柠檬茶',
    subtitle: '清爽少糖，解腻搭档',
    category: '饮品',
    price: 16,
    icon: '🍋',
    tone: '#E8E6A7',
    tags: ['少糖', '清爽'],
    moods: ['吃轻一点'],
    time: '8 分钟',
    match: 79
  },
  {
    id: 'plum-soda',
    name: '青梅气泡饮',
    subtitle: '酸甜青梅，细密气泡',
    category: '饮品',
    price: 18,
    icon: '🫧',
    tone: '#C9DDD0',
    tags: ['冰饮', '解腻'],
    moods: ['想吃辣'],
    time: '6 分钟',
    match: 78
  }
]

module.exports = dishes.map(dish => ({
  ...dish,
  ingredients: (ingredientsByDish[dish.id] || []).map((item, index) => ({
    id: `${dish.id}-ingredient-${index + 1}`,
    optional: false,
    note: '',
    ...item
  }))
}))
