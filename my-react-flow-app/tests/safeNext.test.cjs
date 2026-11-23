const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transform } = require('sucrase');

const compiled = { exports: {} };
new Function('module', 'exports', transform(
  readFileSync(`${__dirname}/../src/platform/safeNext.ts`, 'utf8'),
  { transforms: ['typescript', 'imports'] },
).code)(compiled, compiled.exports);
const { safeNext, loginPathFor } = compiled.exports;
const ORIGIN = 'http://localhost:5173';
const n = (value) => safeNext(value, ORIGIN);

test('รับ path ภายในแอป', () => {
  assert.equal(n('/templates?x=1'), '/templates?x=1');
  assert.equal(n('/'), '/');
  assert.equal(n('/courses/12#top'), '/courses/12#top');
  assert.equal(n('/lab'), '/lab');
});

test('ปฏิเสธรูปแบบ open redirect ทั้งหมด', () => {
  for (const bad of [
    '//evil.com',
    '/\\evil.com',
    '/\\/evil.com',
    'https://evil.com',
    'http://localhost:5173/x',
    'javascript:alert(1)',
    '%2F%2Fevil.com',
    '/%2Fevil.com',
    '/%5Cevil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    '/a\u0000b',
    '/path\\with\\backslash',
    'evil.com',
    '',
    '  /x',
    '/%E0%A4%A',
  ]) {
    assert.equal(n(bad), '/', `ควรปฏิเสธ ${JSON.stringify(bad)}`);
  }
});

test('ปฏิเสธค่าที่ไม่ใช่ string และค่ายาวผิดปกติ', () => {
  assert.equal(n(null), '/');
  assert.equal(n(undefined), '/');
  assert.equal(n(['/x']), '/');
  assert.equal(n(`/${'a'.repeat(3000)}`), '/');
});

test('ไม่พากลับ /login (กันวน)', () => {
  assert.equal(n('/login'), '/');
  assert.equal(n('/login?next=/x'), '/');
});

test('loginPathFor เข้ารหัส next', () => {
  assert.equal(loginPathFor('/'), '/login');
  assert.equal(loginPathFor('/templates?x=1'), '/login?next=%2Ftemplates%3Fx%3D1');
});
