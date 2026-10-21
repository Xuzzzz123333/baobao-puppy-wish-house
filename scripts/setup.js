const fs = require('node:fs')
const path = require('node:path')

const templates = [
  ['project.config.example.json','project.config.json'],
  ['config/cloud.private.example.js','config/cloud.private.js'],
  ['config/release.private.example.js','config/release.private.js'],
  ['cloudfunctions/puppyWishes/subscription.private.example.js','cloudfunctions/puppyWishes/subscription.private.js']
]

function setup(root = path.resolve(__dirname,'..')) {
  return templates.map(([source,destination]) => {
    const target = path.join(root,destination)
    try {
      fs.copyFileSync(path.join(root,source),target,fs.constants.COPYFILE_EXCL)
      return { file:destination,created:true }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      return { file:destination,created:false }
    }
  })
}

if (require.main === module) {
  for (const result of setup()) console.log(`${result.created ? 'created' : 'kept'} ${result.file}`)
  console.log('Fill in your own AppID, environment ID and contact email. Optional subscription settings are server-side only.')
}

module.exports = { setup,templates }
