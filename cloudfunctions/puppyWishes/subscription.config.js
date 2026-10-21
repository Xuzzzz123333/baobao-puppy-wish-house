// Optional WeChat subscription messages. Private settings stay in this function
// directory so Developer Tools can include them when deploying the function.
let privateConfig = {}
try {
  privateConfig = require('./subscription.private')
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error
}

module.exports = {
  templateId:privateConfig.templateId || '',
  fields:{ name:'name1',title:'thing10',content:'thing2',time:'time3',...privateConfig.fields },
  miniprogramState:privateConfig.miniprogramState || 'trial'
}
