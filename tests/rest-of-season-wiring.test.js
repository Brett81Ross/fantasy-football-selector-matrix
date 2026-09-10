const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('browser runtime loads Rest-of-Season Value Matrix after confidence and before waiver/trade engines',()=>{
  const source=fs.readFileSync(require.resolve('../api/app'),'utf8');
  const confidence=source.indexOf('season-core/data-confidence.js');
  const ros=source.indexOf('season-core/rest-of-season-value.js');
  const waiver=source.indexOf('season-core/waiver-assassin.js');
  const trade=source.indexOf('season-core/trade-hunter.js');
  assert.ok(confidence>=0);
  assert.ok(ros>confidence,'ROS authority must load after Data Confidence Matrix');
  assert.ok(waiver>ros,'Waiver Assassin must load after ROS authority');
  assert.ok(trade>ros,'Trade Hunter must load after ROS authority');
});
