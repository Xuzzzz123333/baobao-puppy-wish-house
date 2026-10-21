const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
let collectionsReady = null

function ensureCollections() {
  if (!collectionsReady) {
    collectionsReady = Promise.all(
      ['users', 'dishLikes', 'dishes'].map(async name => {
        try {
          await db.createCollection(name)
        } catch (error) {
          // 集合已存在时会报错；后续读写仍会暴露真实错误。
        }
      })
    )
  }
  return collectionsReady
}

function cleanDishId(value) {
  return String(value || '').trim().slice(0, 80)
}

async function getUser(openid) {
  if (!openid) return null
  try {
    return (await db.collection('users').doc(openid).get()).data
  } catch (error) {
    return null
  }
}

async function getLikes(openid) {
  if (!openid) return []
  try {
    const document = (await db.collection('dishLikes').doc(openid).get()).data
    return Array.isArray(document.dishIds) ? document.dishIds : []
  } catch (error) {
    return []
  }
}

async function resolveChef(openid, me) {
  if (me.role === 'chef') return openid
  if (me.role !== 'diner' || !me.partnerOpenid) return ''
  const partner = await getUser(me.partnerOpenid)
  return partner && partner.role === 'chef' ? me.partnerOpenid : ''
}

async function dishExists(chefOpenid, dishId) {
  if (!chefOpenid || !dishId) return false
  const result = await db.collection('dishes')
    .where({ chefOpenid, dishId })
    .limit(1)
    .get()
  return result.data.length > 0
}

function buildResult(myLikes, partnerLikes, paired) {
  const mySet = new Set(myLikes)
  const partnerSet = new Set(partnerLikes)
  const mutualIds = myLikes.filter(id => partnerSet.has(id))
  const union = new Set([...myLikes, ...partnerLikes])
  return {
    ok: true,
    paired,
    myLikes,
    mutualIds,
    myCount: mySet.size,
    mutualCount: mutualIds.length,
    score: paired && union.size
      ? Math.round((mutualIds.length / union.size) * 100)
      : null
  }
}

exports.main = async event => {
  await ensureCollections()
  const { OPENID } = cloud.getWXContext()
  const action = event.action || 'summary'
  const me = await getUser(OPENID)
  if (!me) return { ok: false, reason: 'account_not_found' }

  if (action === 'setLike') {
    const dishId = cleanDishId(event.dishId)
    if (!dishId) return { ok: false, reason: 'dish_required' }
    const chefOpenid = await resolveChef(OPENID, me)
    if (!(await dishExists(chefOpenid, dishId))) {
      return { ok: false, reason: 'dish_not_found' }
    }
    const current = await getLikes(OPENID)
    const next = event.liked === false
      ? current.filter(id => id !== dishId)
      : Array.from(new Set([...current, dishId])).slice(0, 200)
    await db.collection('dishLikes').doc(OPENID).set({
      data: {
        dishIds: next,
        updatedAt: db.serverDate()
      }
    })
  }

  if (action === 'clear') {
    await db.collection('dishLikes').doc(OPENID).set({
      data: {
        dishIds: [],
        updatedAt: db.serverDate()
      }
    })
  }

  const myLikes = await getLikes(OPENID)
  const partnerLikes = me.partnerOpenid ? await getLikes(me.partnerOpenid) : []
  return buildResult(myLikes, partnerLikes, Boolean(me.partnerOpenid))
}
