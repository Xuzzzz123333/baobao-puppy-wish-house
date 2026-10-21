let privateConfig = {}
try {
  privateConfig = require('./release.private')
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error
}

module.exports = {
  version:'1.0.1',
  privacyUpdatedAt:'2026-10-18',
  privacyEmail:privateConfig.privacyEmail || '',
  // 备案通过后填写平台发放的真实备案号。为空时不展示，不能用示例编号代替。
  filingNumber:privateConfig.filingNumber || '',
  filingQueryUrl:'https://beian.miit.gov.cn/'
}
