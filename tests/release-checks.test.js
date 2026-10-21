const test = require('node:test')
const assert = require('node:assert/strict')
const { validateReleaseConfig } = require('../scripts/release-checks')
const { blocked,scanText } = require('../scripts/verify-public')
function fixture() {
  return {
    project:{ appid:'wx' + '0'.repeat(16),setting:{ urlCheck:true } },
    release:{ version:'1.0.1',privacyEmail:'contact@project.invalid' },cloud:{ envId:'my-test-environment' },
    subscription:{ templateId:'',fields:{ name:'name1',title:'thing10',content:'thing2',time:'time3' },miniprogramState:'trial' },
    target:'trial',notifications:false
  }
}
test('release validation blocks wrong targets, example identity/contact and disabled URL checks',() => {
  assert.doesNotThrow(() => validateReleaseConfig(fixture()))
  for (const mutate of [
    value => { value.target = 'formal' },value => { value.project.appid = 'touristappid' },
    value => { value.project.setting.urlCheck = false },value => { value.cloud.envId = 'YOUR_CLOUDBASE_ENV_ID' },
    value => { value.release.privacyEmail = 'maintainer@example.com' },value => { value.release.privacyEmail = '' },
    value => { value.notifications = true },value => { value.subscription.templateId = 'test_template_123456789012345' }
  ]) { const input = fixture(); mutate(input); assert.throws(() => validateReleaseConfig(input)) }
})
test('release validation accepts configured fields and blocks duplicate or incorrect field types',() => {
  const input = fixture(); input.notifications = true; input.subscription.templateId = 'a'.repeat(43)
  assert.doesNotThrow(() => validateReleaseConfig(input))
  input.subscription.fields.title = 'name1'; assert.throws(() => validateReleaseConfig(input))
  input.subscription.fields.title = 'time9'; assert.throws(() => validateReleaseConfig(input))
})
test('public guard rejects local settings and reports credential locations without values',() => {
  for (const file of ['project.config.json','config/release.private.js','cloudfunctions/puppyWishes/subscription.private.js','.env.production']) assert.equal(blocked(file),true)
  for (const file of ['project.config.example.json','config/release.private.example.js','.env.example']) assert.equal(blocked(file),false)
  const secret = 'ghp_' + 'x'.repeat(36)
  const findings = scanText('fixture.js','// safe\nconst token = "' + secret + '"')
  assert.equal(findings.length,1); assert.equal(findings[0].line,2)
  assert.equal(JSON.stringify(findings).includes(secret),false)
  assert.equal(scanText('fixture.js',"templateId:'test_template_123456789012345'").length,0)
  assert.equal(scanText('fixture.js',"templateId:'" + 'a'.repeat(43) + "'").length,1)
})
