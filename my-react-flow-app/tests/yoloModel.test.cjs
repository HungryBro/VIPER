const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transform } = require('sucrase');

const compiled = { exports: {} };
new Function('module', 'exports', transform(
  readFileSync(`${__dirname}/../src/lib/yoloModel.ts`, 'utf8'),
  { transforms: ['typescript', 'imports'] },
).code)(compiled, compiled.exports);
const { resolveYoloModel } = compiled.exports;
const train = (path) => ({ id: 'train', type: 'yolo-train', data: { payload: { best_model_path: path } } });
const edge = (source) => ({ source, target: 'detect' });

test('connected Train overrides manual weights and other upstream outputs', () => {
  const other = { id: 'other', data: { payload: { model_path: 'old.pt' } } };
  const model = resolveYoloModel('detect', [other, train('new/best.pt')], [edge('other'), edge('train')], 'manual.pt');
  assert.equal(model.path, 'new/best.pt');
  assert.equal(model.source.id, 'train');
});
test('connected Train without output never falls back to manual or old upstream weights', () => {
  const other = { id: 'other', data: { payload: { model_path: 'old.pt' } } };
  for (const path of [undefined, '', '   ']) {
    const model = resolveYoloModel('detect', [other, train(path)], [edge('other'), edge('train')], 'manual.pt');
    assert.equal(model.path, undefined);
    assert.equal(model.source.id, 'train');
  }
});
test('new Train output and disconnection update the effective model without changing manual input', () => {
  assert.equal(resolveYoloModel('detect', [train('first.pt')], [edge('train')], 'manual.pt').path, 'first.pt');
  assert.equal(resolveYoloModel('detect', [train('second.pt')], [edge('train')], 'manual.pt').path, 'second.pt');
  assert.equal(resolveYoloModel('detect', [train('second.pt')], [], 'manual.pt').path, 'manual.pt');
});
test('standalone defaults and indirect model-producing nodes remain supported', () => {
  assert.equal(resolveYoloModel('detect', [], []).path, 'models/yolo11n.pt');
  const parent = { id: 'other', data: { payload: { model_path: 'inference.pt' } } };
  assert.equal(resolveYoloModel('detect', [parent], [edge('other')]).path, 'inference.pt');
});
