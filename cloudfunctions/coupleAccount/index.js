const crypto = require('crypto')
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const INVITE_TTL = 10 * 60 * 1000
let collectionsReady = null

function ensureCollections() {
  if (!collectionsReady) {
    collectionsReady = Promise.all(
      [
        'users',
        'puppyWishes',
        'inviteCodes',
        'orders',
        'dishLikes',
        'dishes',
        'weeklyPlans',
        'orderRatings',
        'occasions',
        'shoppingLists'
      ].map(async name => {
        try {
          await db.createCollection(name)
        } catch (error) {
          // 集合已存在时会报错；后续真实读写仍会暴露权限或网络问题。
        }
      })
    )
  }
  return collectionsReady
}

function cleanNickname(value) {
  return String(value || '').trim().slice(0, 20)
}

function cleanRole(value) {
  return ['chef', 'diner'].includes(value) ? value : ''
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizePreferences(value) {
  const preferences = value || {}
  const spiceLevels = ['不辣', '微辣', '中辣', '重辣']
  const portions = ['小份', '正常', '大份']
  return {
    allergies: cleanText(preferences.allergies, 40),
    avoidFoods: cleanText(preferences.avoidFoods, 40),
    spiceLevel: spiceLevels.includes(preferences.spiceLevel)
      ? preferences.spiceLevel
      : '微辣',
    portion: portions.includes(preferences.portion)
      ? preferences.portion
      : '正常'
  }
}

async function checkTextSafety(openid, content, scene) {
  const text = cleanText(content, 500)
  if (!text) return { ok: true }
  try {
    const response = await cloud.openapi.security.msgSecCheck({
      content: text,
      version: 2,
      scene: scene || 1,
      openid
    })
    const suggestion = response.result && response.result.suggest
    return suggestion === 'pass' ? { ok:true } : { ok:false,reason:'content_risky' }
  } catch (error) {
    console.error('msgSecCheck failed', error)
    return { ok:false,reason:'content_review_unavailable' }
  }
}

function createCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[crypto.randomInt(alphabet.length)]
  }
  return code
}

function pairKeyFor(openid, partnerOpenid) {
  return crypto
    .createHash('sha1')
    .update([openid, partnerOpenid].filter(Boolean).sort().join(':'))
    .digest('hex')
    .slice(0, 24)
}

async function readUser(reader,openid) {
  try {
    return (await reader.collection('users').doc(openid).get()).data || null
  } catch (error) {
    if (/not exist|not found|不存在|does not exist/i.test(error.message || error.errMsg || '')) return null
    throw error
  }
}
async function ensureUser(openid) {
  const existing = await readUser(db,openid)
  if (existing) return existing
  return db.runTransaction(async transaction => {
    const latest = await readUser(transaction,openid)
    if (latest) return latest
    const user = {
      nickname: '微信用户',
      role: '',
      preferences: normalizePreferences(),
      partnerOpenid: '',
      inviteCode: '',
      notificationEnabled: false,
      notificationGrantCount: 0,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
    await transaction.collection('users').doc(openid).set({ data: user })
    return user
  })
}

async function getAccount(openid) {
  const me = await ensureUser(openid)
  let partner = null
  if (me.partnerOpenid) {
    try {
      const partnerData = (await db.collection('users').doc(me.partnerOpenid).get()).data
      if (!partnerData || partnerData.partnerOpenid !== openid || Number(partnerData.pairedAt || 0) !== Number(me.pairedAt || 0)) throw new Error('pair_required')
      partner = {
        nickname: partnerData.nickname || '微信用户',
        role: cleanRole(partnerData.role),
        preferences: normalizePreferences(partnerData.preferences),
        notificationEnabled: partnerData.notificationEnabled === true,
        notificationGrantCount: Math.max(0, Number(partnerData.notificationGrantCount) || 0)
      }
    } catch (error) {
      partner = null
    }
  }

  return {
    me: {
      nickname: me.nickname || '微信用户',
      role: cleanRole(me.role),
      preferences: normalizePreferences(me.preferences),
      notificationEnabled: me.notificationEnabled === true,
      notificationGrantCount: Math.max(0, Number(me.notificationGrantCount) || 0)
    },
    partner: partner
      ? {
          ...partner,
          role: cleanRole(partner.role)
        }
      : null,
    inviteCode: me.inviteCode || '',
    inviteExpiresAt: me.inviteExpiresAt || null,
    pairedAt: me.pairedAt || null
  }
}

async function readInvite(reader,code) {
  try { return (await reader.collection('inviteCodes').doc(code).get()).data || null }
  catch (error) { if (/not exist|not found|不存在|does not exist/i.test(error.message || error.errMsg || '')) return null; throw error }
}
async function createInvite(openid) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createCode()
    const result = await db.runTransaction(async transaction => {
      const me = await readUser(transaction,openid)
      if (!me || !cleanRole(me.role)) return { ok:false,reason:'role_required' }
      if (me.partnerOpenid) return { ok:false,reason:'already_bound' }
      if (me.inviteCode) {
        const existing = await readInvite(transaction,me.inviteCode)
        if (existing && existing.ownerOpenid === openid && !existing.usedBy && !existing.revoked && Number(existing.expiresAt || 0) > Date.now()) return me.inviteCode
      }
      if (await readInvite(transaction,code)) return null
      const expiresAt = Date.now() + INVITE_TTL
      await transaction.collection('inviteCodes').doc(code).set({ data:{ ownerOpenid:openid,usedBy:'',revoked:false,expiresAt,createdAt:db.serverDate() } })
      await transaction.collection('users').doc(openid).update({ data:{ inviteCode:code,inviteExpiresAt:expiresAt,updatedAt:db.serverDate() } })
      return code
    })
    if (result) return result
  }
  throw new Error('invite_code_generation_failed')
}

async function bindInvite(openid, inviteCode) {
  const code = String(inviteCode || '').trim().toUpperCase()
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return { ok:false,reason:'invalid_code' }
  let invite
  try {
    invite = (await db.collection('inviteCodes').doc(code).get()).data
  } catch (error) {
    return { ok: false, reason: 'invalid_code' }
  }

  if (invite.ownerOpenid === openid) return { ok: false, reason: 'own_code' }
  if (invite.usedBy) return { ok: false, reason: 'code_used' }
  if (invite.revoked === true) return { ok: false, reason: 'code_revoked' }
  if (Number(invite.expiresAt || 0) <= Date.now()) {
    return { ok: false, reason: 'code_expired' }
  }

  const me = await ensureUser(openid)
  const partner = await readUser(db,invite.ownerOpenid)
  if (!partner) return { ok:false,reason:'invalid_code' }
  const myRole = cleanRole(me.role)
  const partnerRole = cleanRole(partner.role)
  if (!myRole || !partnerRole) {
    return { ok: false, reason: 'role_required' }
  }
  if (myRole === partnerRole) {
    return { ok: false, reason: 'role_conflict' }
  }
  if (me.partnerOpenid || partner.partnerOpenid) {
    return { ok: false, reason: 'already_bound' }
  }

  const pairedAt = Date.now()
  try {
    await db.runTransaction(async transaction => {
      const users = transaction.collection('users')
      const invites = transaction.collection('inviteCodes')
      const [latestInviteSnapshot, latestMeSnapshot, latestPartnerSnapshot] =
        await Promise.all([
          invites.doc(code).get(),
          users.doc(openid).get(),
          users.doc(invite.ownerOpenid).get()
        ])
      const latestInvite = latestInviteSnapshot.data
      const latestMe = latestMeSnapshot.data
      const latestPartner = latestPartnerSnapshot.data
      if (!latestInvite || !latestMe || !latestPartner || latestInvite.ownerOpenid !== invite.ownerOpenid || latestPartner.inviteCode !== code) throw new Error('invalid_code')
      if (latestInvite.ownerOpenid === openid) throw new Error('own_code')
      if (latestInvite.usedBy) throw new Error('code_used')
      if (latestInvite.revoked === true) throw new Error('code_revoked')
      if (Number(latestInvite.expiresAt || 0) <= Date.now()) {
        throw new Error('code_expired')
      }
      const latestMyRole = cleanRole(latestMe.role)
      const latestPartnerRole = cleanRole(latestPartner.role)
      if (!latestMyRole || !latestPartnerRole) throw new Error('role_required')
      if (latestMyRole === latestPartnerRole) throw new Error('role_conflict')
      if (latestMe.partnerOpenid || latestPartner.partnerOpenid) {
        throw new Error('already_bound')
      }

      await users.doc(openid).update({
        data: {
          partnerOpenid: latestInvite.ownerOpenid,
          pairedAt,
          updatedAt: db.serverDate()
        }
      })
      await users.doc(latestInvite.ownerOpenid).update({
        data: {
          partnerOpenid: openid,
          pairedAt,
          updatedAt: db.serverDate()
        }
      })
      await invites.doc(code).update({
        data: {
          usedBy: openid,
          usedAt: db.serverDate()
        }
      })
    })
  } catch (error) {
    const reasons = [
      'invalid_code',
      'own_code',
      'code_used',
      'code_revoked',
      'code_expired',
      'role_required',
      'role_conflict',
      'already_bound'
    ]
    const reason = reasons.find(item => String(error.message || error).includes(item))
    if (reason) return { ok: false, reason }
    throw error
  }
  return { ok: true }
}

async function revokeInvite(openid) {
  return db.runTransaction(async transaction => {
    const me = await readUser(transaction,openid)
    if (!me) return { ok:false,reason:'account_required' }
    if (me.partnerOpenid) return { ok:false,reason:'already_bound' }
    const invite = me.inviteCode ? await readInvite(transaction,me.inviteCode) : null
    if (invite && invite.ownerOpenid === openid) await transaction.collection('inviteCodes').doc(me.inviteCode).update({ data:{ revoked:true,revokedAt:db.serverDate() } })
    await transaction.collection('users').doc(openid).update({ data:{ inviteCode:'',inviteExpiresAt:null,updatedAt:db.serverDate() } })
    return { ok:true }
  })
}

async function unbindPartner(openid) {
  const me = await ensureUser(openid)
  if (!me.partnerOpenid) return { ok:false,reason:'partner_not_found' }
  const partnerOpenid = me.partnerOpenid,pairKey = pairKeyFor(openid,partnerOpenid)
  const result = await db.runTransaction(async transaction => {
    const latest = await readUser(transaction,openid)
    if (!latest || latest.partnerOpenid !== partnerOpenid || Number(latest.pairedAt || 0) !== Number(me.pairedAt || 0)) return { ok:false,reason:'state_changed' }
    const partner = await readUser(transaction,partnerOpenid)
    const data = { partnerOpenid:'',pairedAt:null,inviteCode:'',inviteExpiresAt:null,updatedAt:db.serverDate() }
    await transaction.collection('users').doc(openid).update({ data })
    if (partner && partner.partnerOpenid === openid && Number(partner.pairedAt || 0) === Number(latest.pairedAt || 0)) await transaction.collection('users').doc(partnerOpenid).update({ data })
    return { ok:true }
  })
  if (!result.ok) return result
  await deleteDocuments('weeklyPlans',{ pairKey })
  await deleteDocuments('orderRatings',{ pairKey })
  await deleteDocuments('occasions',{ pairKey })
  await deleteDocuments('shoppingLists',{ pairKey })
  return result
}

async function setRole(openid, requestedRole) {
  const role = cleanRole(requestedRole)
  if (!role) return { ok:false,reason:'invalid_role' }
  return db.runTransaction(async transaction => {
    const me = await readUser(transaction,openid)
    if (!me) return { ok:false,reason:'account_required' }
    if (me.partnerOpenid && me.role !== role) return { ok:false,reason:'role_conflict' }
    await transaction.collection('users').doc(openid).update({ data:{ role,updatedAt:db.serverDate() } })
    return { ok:true }
  })
}

async function deleteDocuments(collectionName, query) {
  let removed = 0
  while (true) {
    const result = await db.collection(collectionName).where(query).limit(100).get()
    if (!result.data.length) break
    await Promise.all(result.data.map(document =>
      db.collection(collectionName).doc(document._id).remove()
    ))
    removed += result.data.length
    if (result.data.length < 100) break
  }
  return removed
}

async function deleteAccountData(openid) {
  const me = await ensureUser(openid)
  const pairKey = pairKeyFor(openid, me.partnerOpenid)
  if (me.partnerOpenid) {
    const unbound = await unbindPartner(openid)
    if (!unbound.ok) return unbound
  }
  const revoked = await revokeInvite(openid)
  if (!revoked.ok) return revoked

  await deleteDocuments('puppyWishes',db.command.or([{ creatorId:openid },{ recipientId:openid }]))

  const dishResult = await db.collection('dishes')
    .where({ chefOpenid: openid })
    .limit(100)
    .get()
  const imageFileIds = dishResult.data
    .map(dish => dish.imageUrl)
    .filter(fileId => String(fileId || '').startsWith('cloud://'))
  for (let index = 0; index < imageFileIds.length; index += 50) {
    try {
      await cloud.deleteFile({ fileList: imageFileIds.slice(index, index + 50) })
    } catch (error) {
      console.error('delete dish images failed', error)
    }
  }

  await deleteDocuments('dishes', { chefOpenid: openid })
  await deleteDocuments('orders', { creatorOpenid: openid })
  await deleteDocuments('inviteCodes', { ownerOpenid: openid })
  await deleteDocuments('inviteCodes', { usedBy: openid })
  await deleteDocuments('weeklyPlans', { pairKey })
  await deleteDocuments('orderRatings', { pairKey })
  await deleteDocuments('occasions', { pairKey })
  await deleteDocuments('shoppingLists', { pairKey })

  const receivedOrders = await db.collection('orders')
    .where({ partnerOpenid: openid })
    .limit(100)
    .get()
  await Promise.all(receivedOrders.data.map(order =>
    db.collection('orders').doc(order._id).update({
      data: {
        partnerOpenid: '',
        chefOpenid: order.chefOpenid === openid ? '' : (order.chefOpenid || ''),
        dinerOpenid: order.dinerOpenid === openid ? '' : (order.dinerOpenid || ''),
        hiddenFor: (order.hiddenFor || []).filter(id => id !== openid),
        updatedAt: db.serverDate()
      }
    })
  ))

  try {
    await db.collection('dishLikes').doc(openid).remove()
  } catch (error) {
    // 尚未产生喜欢记录时无需处理。
  }
  await db.collection('users').doc(openid).remove()
  return { ok: true, deleted: true }
}

async function dispatch(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return { ok:false,reason:'invalid_request' }
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { ok:false,reason:'login_required' }
  const action = event.action || 'login'
  if (!['login','updateProfile','createInvite','revokeInvite','regenerateInvite','bindInvite','setNotificationEnabled','addNotificationGrant','setRole','updatePreferences','unbindPartner','deleteAccount'].includes(action)) return { ok:false,reason:'unknown_action' }
  await ensureCollections()
  await ensureUser(OPENID)

  if (action === 'updateProfile') {
    if (typeof event.nickname !== 'string' || event.nickname.length > 20) return { ok:false,reason:'invalid_nickname' }
    const nickname = cleanNickname(event.nickname)
    if (!nickname) return { ok: false, reason: 'empty_nickname' }
    const safety = await checkTextSafety(OPENID, nickname, 1)
    if (!safety.ok) return safety
    await db.collection('users').doc(OPENID).update({
      data: {
        nickname,
        updatedAt: db.serverDate()
      }
    })
  }

  if (action === 'createInvite') {
    const result = await createInvite(OPENID)
    if (result && result.ok === false) return result
  }

  if (action === 'revokeInvite') {
    const result = await revokeInvite(OPENID)
    if (!result.ok) return result
  }

  if (action === 'regenerateInvite') {
    const revoked = await revokeInvite(OPENID)
    if (!revoked.ok) return revoked
    const result = await createInvite(OPENID)
    if (result && result.ok === false) return result
  }

  if (action === 'bindInvite') {
    const result = await bindInvite(OPENID, event.inviteCode)
    if (!result.ok) return result
  }

  if (action === 'setNotificationEnabled') {
    await db.collection('users').doc(OPENID).update({
      data: {
        notificationEnabled: event.enabled === true,
        ...(event.enabled === true ? {} : { notificationGrantCount: 0 }),
        updatedAt: db.serverDate()
      }
    })
  }

  if (action === 'addNotificationGrant') {
    const account = await ensureUser(OPENID)
    await db.collection('users').doc(OPENID).update({
      data: {
        notificationEnabled: true,
        notificationGrantCount: Math.max(
          0,
          Number(account.notificationGrantCount) || 0
        ) + 1,
        updatedAt: db.serverDate()
      }
    })
  }

  if (action === 'setRole') {
    const result = await setRole(OPENID, event.role)
    if (!result.ok) return result
  }

  if (action === 'updatePreferences') {
    const preferences = normalizePreferences(event.preferences)
    const safety = await checkTextSafety(
      OPENID,
      `${preferences.allergies} ${preferences.avoidFoods}`,
      1
    )
    if (!safety.ok) return safety
    await db.collection('users').doc(OPENID).update({
      data: {
        preferences,
        updatedAt: db.serverDate()
      }
    })
  }

  if (action === 'unbindPartner') {
    const result = await unbindPartner(OPENID)
    if (!result.ok) return result
  }

  if (action === 'deleteAccount') {
    return deleteAccountData(OPENID)
  }

  return {
    ok: true,
    account: await getAccount(OPENID)
  }
}
exports.main = async (event = {}) => {
  try { return await dispatch(event) }
  catch (error) { console.error('coupleAccount action failed',event && event.action,error.code || error.errCode || error.message); return { ok:false,reason:'service_unavailable' } }
}
