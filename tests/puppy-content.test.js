const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const content = require('../cloudfunctions/puppyWishes/daily-content')
const rules = require('../cloudfunctions/puppyWishes/keepsakes')
const { items } = require('../cloudfunctions/puppyWishes/catalog')
test('180 个行动、240 个问题内容完整、无重复、全部可转入有效心愿',() => {
  assert.equal(content.actions.length,180); assert.equal(content.questions.length,240)
  assert.equal(new Set(content.questions).size,240)
  assert.equal(new Set(content.actions.map(item => item[1])).size,180)
  assert.equal(new Set(content.actions.map(item => item[2])).size,180)
  for (const action of content.actions) {
    assert.ok(items.some(item => item.id === action[0]),action[0])
    assert.ok(action[1] && action[2] && action[3]); assert.ok(action[1].length + action[2].length < 480)
  }
  for (const file of ['daily-content.js','notices.js']) assert.equal(fs.readFileSync(path.join(__dirname,'../data',file),'utf8'),fs.readFileSync(path.join(__dirname,'../cloudfunctions/puppyWishes',file),'utf8'))
})
test('每日固定、完整周期不重复，日期按北京时间切换',() => {
  const questions = new Set(),actions = new Set()
  for (let i = 0; i < 240; i += 1) {
    const day = new Date(Date.UTC(2026,9,18 + i)).toISOString().slice(0,10),card = rules.dailyCard(day)
    assert.deepEqual(card,rules.dailyCard(day)); questions.add(card.questionId)
    if (i < 180) actions.add(card.action.id)
  }
  assert.equal(questions.size,240); assert.equal(actions.size,180)
  assert.equal(rules.dayKey(Date.parse('2026-10-18T15:59:59Z')),'2026-10-18')
  assert.equal(rules.dayKey(Date.parse('2026-10-18T16:00:00Z')),'2026-10-19')
})
test('扩库保留原先 30 道题和 12 个行动，旧答案与已封存题目不会被换题',() => {
  assert.deepEqual(content.questions.slice(0,30),content.legacyQuestions)
  assert.deepEqual(content.actions.slice(0,12).map(item => item.slice(0,4)),content.legacyActions.map(item => item.slice(0,4)))
  const day = '2026-10-18',record = { answers:{ chef:{ text:'原问题的答案' } } }
  assert.equal(rules.cardForRecord(record,day).question,rules.legacyCard(day).question)
  const pinned = { ...rules.dailyCard(day),question:'已经确定的原题目' }
  assert.equal(rules.cardForRecord({ ...record,card:pinned },day).question,'已经确定的原题目')
  assert.equal(rules.questionView({ ...record,card:pinned },'diner',day).partnerAnswer,'')
})
