const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { setup,templates } = require('../scripts/setup')

test('setup creates local configuration from templates and never overwrites existing settings',t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'puppy-setup-'))
  t.after(() => fs.rmSync(root,{ recursive:true,force:true }))
  for (const [source] of templates) {
    fs.mkdirSync(path.dirname(path.join(root,source)),{ recursive:true })
    fs.copyFileSync(path.join(__dirname,'..',source),path.join(root,source))
  }
  assert.equal(setup(root).filter(item => item.created).length,templates.length)
  const project = path.join(root,'project.config.json')
  const original = JSON.parse(fs.readFileSync(project,'utf8'))
  assert.equal(original.appid,'touristappid')
  fs.writeFileSync(project,JSON.stringify({ ...original,description:'keep my local changes' }))
  assert.equal(setup(root).some(item => item.created),false)
  assert.equal(JSON.parse(fs.readFileSync(project,'utf8')).description,'keep my local changes')
})

function loadConfig(relative,privateConfig) {
  const module = { exports:{} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',relative),'utf8'),{
    module,require() {
      if (privateConfig) return privateConfig
      const error = new Error('missing local configuration'); error.code = 'MODULE_NOT_FOUND'; throw error
    }
  })
  return module.exports
}

test('a fresh checkout disables cloud access, contact copying and WeChat notifications by default',() => {
  assert.equal(loadConfig('config/cloud.js').envId,'')
  assert.equal(loadConfig('config/release.js').privacyEmail,'')
  const config = loadConfig('cloudfunctions/puppyWishes/subscription.config.js')
  assert.equal(config.templateId,'')
  assert.equal(config.miniprogramState,'trial')
})

test('deployment-specific contact and subscription fields are read from local configuration',() => {
  assert.equal(loadConfig('config/release.js',{ privacyEmail:'maintainer@example.com' }).privacyEmail,'maintainer@example.com')
  const config = loadConfig('cloudfunctions/puppyWishes/subscription.config.js',{
    templateId:'test_template_123456789012345',fields:{ name:'name9',title:'thing8' },miniprogramState:'formal'
  })
  assert.equal(config.fields.name,'name9'); assert.equal(config.fields.title,'thing8')
  assert.equal(config.fields.time,'time3'); assert.equal(config.miniprogramState,'formal')
})
