const cloud = require('./cloud')

const PROFILE_KEY = 'liangkou_profile'
const ACCOUNT_KEY = 'liangkou_account'

function initialOf(name) {
  const text = String(name || '微信用户').trim()
  return text.slice(0, 1) || '微'
}

function getLocalProfile() {
  return wx.getStorageSync(PROFILE_KEY) || {
    nickname: '微信用户'
  }
}

function getCachedAccount() {
  const cached = wx.getStorageSync(ACCOUNT_KEY)
  if (cached) return cached
  const me = getLocalProfile()
  return {
    me,
    partner: null,
    inviteCode: '',
    pairedAt: null,
    cloudReady: false
  }
}

function normalizeAccount(account, cloudReady) {
  const normalized = {
    me: account.me || getLocalProfile(),
    partner: account.partner || null,
    inviteCode: account.inviteCode || '',
    inviteExpiresAt: account.inviteExpiresAt || null,
    pairedAt: account.pairedAt || null,
    cloudReady
  }
  wx.setStorageSync(PROFILE_KEY, normalized.me)
  wx.setStorageSync(ACCOUNT_KEY, normalized)
  return normalized
}

async function loadAccount() {
  if (!cloud.isConfigured()) {
    return normalizeAccount(getCachedAccount(), false)
  }
  try {
    const response = await cloud.callFunction('coupleAccount', { action: 'login' })
    return normalizeAccount(response.result.account, true)
  } catch (error) {
    console.error('加载情侣账号失败', error)
    return normalizeAccount(getCachedAccount(), false)
  }
}

async function saveNickname(nickname) {
  const cleanName = String(nickname || '').trim().slice(0, 20)
  if (!cleanName) {
    return { ok: false, reason: 'empty_nickname' }
  }

  const previous = getCachedAccount()
  const cached = { ...previous,me:{ ...previous.me,nickname:cleanName } }
  wx.setStorageSync(PROFILE_KEY, cached.me)
  wx.setStorageSync(ACCOUNT_KEY, cached)

  if (!cloud.isConfigured()) {
    return {
      ok: true,
      synced: false,
      account: normalizeAccount(cached, false)
    }
  }

  try {
    const response = await cloud.callFunction('coupleAccount', {
      action: 'updateProfile',
      nickname: cleanName
    })
    if (!response.result || !response.result.ok || !response.result.account) {
      wx.setStorageSync(PROFILE_KEY,previous.me)
      wx.setStorageSync(ACCOUNT_KEY,previous)
      return { ok:false,reason:response.result && response.result.reason || 'update_failed' }
    }
    return {
      ok: true,
      synced: true,
      account: normalizeAccount(response.result.account, true)
    }
  } catch (error) {
    console.error('同步微信名称失败', error)
    return {
      ok: true,
      synced: false,
      account: normalizeAccount(cached, false)
    }
  }
}

async function saveRole(role) {
  if (!['chef', 'diner'].includes(role)) {
    return { ok: false, reason: 'invalid_role' }
  }
  if (!cloud.isConfigured()) {
    return { ok: false, reason: 'cloud_not_configured' }
  }

  try {
    const response = await cloud.callFunction('coupleAccount', {
      action: 'setRole',
      role
    })
    if (!response.result.ok) return response.result
    return {
      ok: true,
      account: normalizeAccount(response.result.account, true)
    }
  } catch (error) {
    console.error('保存情侣角色失败', error)
    return { ok: false, reason: 'update_failed', error }
  }
}

async function savePreferences(preferences) {
  if (!cloud.isConfigured()) {
    return { ok: false, reason: 'cloud_not_configured' }
  }
  try {
    const response = await cloud.callFunction('coupleAccount', {
      action: 'updatePreferences',
      preferences
    })
    if (!response.result.ok) return response.result
    return {
      ok: true,
      account: normalizeAccount(response.result.account, true)
    }
  } catch (error) {
    console.error('保存食客口味失败', error)
    return { ok: false, reason: 'update_failed', error }
  }
}

async function createInvite() {
  if (!cloud.isConfigured()) return { ok: false, reason: 'cloud_not_configured' }
  try {
    const response = await cloud.callFunction('coupleAccount', { action: 'createInvite' })
    if (!response.result.ok) return response.result
    return {
      ok: true,
      account: normalizeAccount(response.result.account, true)
    }
  } catch (error) {
    console.error('生成情侣邀请码失败', error)
    return { ok: false, reason: 'create_failed', error }
  }
}

async function bindPartner(inviteCode) {
  const code = String(inviteCode || '').trim().toUpperCase()
  if (!cloud.isConfigured()) return { ok: false, reason: 'cloud_not_configured' }
  if (!code) return { ok: false, reason: 'empty_code' }
  try {
    const response = await cloud.callFunction('coupleAccount', {
      action: 'bindInvite',
      inviteCode: code
    })
    if (!response.result.ok) return response.result
    return {
      ok: true,
      account: normalizeAccount(response.result.account, true)
    }
  } catch (error) {
    console.error('绑定另一半失败', error)
    return { ok: false, reason: 'bind_failed', error }
  }
}

async function revokeInvite() {
  if (!cloud.isConfigured()) return { ok: false, reason: 'cloud_not_configured' }
  try {
    const response = await cloud.callFunction('coupleAccount', {
      action: 'revokeInvite'
    })
    if (!response.result.ok) return response.result
    return {
      ok: true,
      account: normalizeAccount(response.result.account, true)
    }
  } catch (error) {
    return { ok: false, reason: 'update_failed', error }
  }
}

async function regenerateInvite() {
  if (!cloud.isConfigured()) return { ok: false, reason: 'cloud_not_configured' }
  try {
    const response = await cloud.callFunction('coupleAccount', {
      action: 'regenerateInvite'
    })
    if (!response.result.ok) return response.result
    return {
      ok: true,
      account: normalizeAccount(response.result.account, true)
    }
  } catch (error) {
    return { ok: false, reason: 'update_failed', error }
  }
}

async function unbindPartner() {
  if (!cloud.isConfigured()) return { ok: false, reason: 'cloud_not_configured' }
  try {
    const response = await cloud.callFunction('coupleAccount', {
      action: 'unbindPartner'
    })
    if (!response.result.ok) return response.result
    return {
      ok: true,
      account: normalizeAccount(response.result.account, true)
    }
  } catch (error) {
    return { ok: false, reason: 'update_failed', error }
  }
}

async function setNotificationEnabled(enabled) {
  if (!cloud.isConfigured()) return { ok: false, reason: 'cloud_not_configured' }
  try {
    await cloud.callFunction('coupleAccount', {
      action: 'setNotificationEnabled',
      enabled: Boolean(enabled)
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: 'update_failed', error }
  }
}

async function addNotificationGrant() {
  if (!cloud.isConfigured()) return { ok: false, reason: 'cloud_not_configured' }
  try {
    const response = await cloud.callFunction('coupleAccount', {
      action: 'addNotificationGrant'
    })
    if (!response.result.ok) return response.result
    return {
      ok: true,
      account: normalizeAccount(response.result.account, true)
    }
  } catch (error) {
    return { ok: false, reason: 'update_failed', error }
  }
}

async function deleteAccount() {
  if (!cloud.isConfigured()) return { ok: false, reason: 'cloud_not_configured' }
  try {
    const response = await cloud.callFunction('coupleAccount', {
      action: 'deleteAccount'
    })
    return response.result
  } catch (error) {
    return { ok: false, reason: 'delete_failed', error }
  }
}

module.exports = {
  initialOf,
  getCachedAccount,
  loadAccount,
  saveNickname,
  saveRole,
  savePreferences,
  createInvite,
  bindPartner,
  revokeInvite,
  regenerateInvite,
  unbindPartner,
  setNotificationEnabled,
  addNotificationGrant,
  deleteAccount
}
