const assert = require('node:assert/strict')
function validateReleaseConfig({ project,release,subscription,cloud,target,notifications = true }) {
  assert.ok(['trial','formal'].includes(target),'Invalid release target')
  assert.match(project.appid,/^wx[0-9a-f]{16}$/,'Configure your own AppID')
  assert.equal(project.setting.urlCheck,true,'URL validation must stay enabled')
  assert.ok(cloud.envId && !/^YOUR_|^example/i.test(cloud.envId),'Configure your own cloud environment')
  assert.match(release.version,/^\d+\.\d+\.\d+$/)
  assert.match(release.privacyEmail,/^[^\s@]+@[^\s@]+\.[^\s@]+$/,'Configure a privacy contact email')
  assert.ok(!/@example\.(com|org|net)$/i.test(release.privacyEmail),'Replace the example privacy contact')
  assert.equal(subscription.miniprogramState,target,'Notification target must match the selected release target')
  if (!notifications) {
    assert.equal(subscription.templateId,'','--without-notifications requires an empty template ID')
    return
  }
  assert.match(subscription.templateId,/^[\w-]{20,}$/,'Configure a WeChat subscription template')
  assert.ok(!/^(YOUR_|test_|template_|example)/i.test(subscription.templateId),'Replace the example subscription template')
  const fields = subscription.fields
  assert.deepEqual(Object.keys(fields).sort(),['content','name','time','title'])
  assert.equal(new Set(Object.values(fields)).size,4,'Template fields must be distinct')
  for (const [semantic,key] of Object.entries(fields)) assert.match(key,semantic === 'time' ? /^time\d+$/ : /^(thing|name)\d+$/,'Invalid template field: ' + semantic)
}
module.exports = { validateReleaseConfig }
