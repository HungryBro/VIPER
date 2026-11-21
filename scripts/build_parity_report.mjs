#!/usr/bin/env node
// สร้าง outputs/parity-report/index.html (T22): ภาพ mockup เทียบของจริงทุกแถวใน tasks/parity.md
// รัน (จากโฟลเดอร์หลัก VIPER): node scripts/build_parity_report.mjs
// อ่าน: tasks/parity.md, outputs/parity-report/{data.json, mockup/manifest.json, real/manifest.json}
// ภาพ: outputs/parity-report/{mockup,real}/<แถว>__<บทบาท>__<กว้าง>.png (ถ่ายด้วย scripts/parity_screenshots.py)
// path ภาพในรายงานเป็น relative เปิดจากดิสก์ได้เลย ไม่ใช้ dependency เพิ่ม
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'outputs', 'parity-report');
const ROLE_LABEL = { guest: 'ผู้เยี่ยมชม', learner: 'ผู้เรียน', instructor: 'ผู้สอน', admin: 'ผู้ดูแล' };
const ROLE_ORDER = ['guest', 'learner', 'instructor', 'admin'];
const WIDTHS = [1440, 375];
const STATUSES = ['ย้ายแล้ว', 'ว่างตามแผน', 'ตัดออก', 'ยังไม่ทำ'];
const SIM_LABEL = 'ผู้สอนจำลอง (can_teach จำลองที่ /api/auth/me)';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// markdown เล็กน้อย: `code` เป็น <code>
const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

function splitRow(line) {
  const cells = line.replace(/^\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/);
  return cells.map((c) => c.trim().replace(/\\\|/g, '|'));
}

// ---------------------------------------------------------------- อ่าน parity.md
const mdText = readFileSync(path.join(REPO, 'tasks', 'parity.md'), 'utf8');
const rows = [];
for (const line of mdText.split('\n')) {
  const m = line.match(/^\|\s*([PCR]-\d{2})\s*\|/);
  if (!m) continue;
  const c = splitRow(line);
  if (m[1][0] === 'R') {
    // รหัส | ความสามารถ | ไฟล์ในของจริง | วิธีตรวจ | สถานะ | task ที่ตรวจ
    rows.push({ id: c[0], kind: 'R', title: c[1], real: c[2], source: c[2], status: c[4], target: '', note: 'วิธีตรวจ: ' + c[3], task: c[5] });
  } else {
    // รหัส | ตำแหน่งใน mockup | route/ไฟล์จริง | แหล่งข้อมูลจริง | บทบาท | เป้าหมาย | ปัจจุบัน | task | ภาพ mockup | หมายเหตุ
    rows.push({ id: c[0], kind: m[1][0], title: c[1], real: c[2], source: c[3], roles: c[4], target: c[5], status: c[6], task: c[7], note: c[9] ?? '' });
  }
}

// ---------------------------------------------------------------- manifest ภาพ
const mockM = readJson(path.join(OUT, 'mockup', 'manifest.json'));
const realM = readJson(path.join(OUT, 'real', 'manifest.json'));
if (!realM) throw new Error('ไม่พบ outputs/parity-report/real/manifest.json: รัน parity_screenshots.py --target real ก่อน');
const shotsOf = (m, id) => (m ? m.shots.filter((s) => s.row === id) : []);
const exists = (rel) => existsSync(path.join(OUT, rel));

function figure(label, rel, extra = '') {
  if (!exists(rel)) return `<figure class="ph"><figcaption>${esc(label)}</figcaption><div class="missing">ไม่มีภาพ${extra ? ' · ' + esc(extra) : ''}</div></figure>`;
  return `<figure><figcaption>${esc(label)}</figcaption><a href="${esc(rel)}"><img loading="lazy" src="${esc(rel)}" alt="${esc(label)}"></a></figure>`;
}

function rowSection(r) {
  const mock = shotsOf(mockM, r.id);
  const real = shotsOf(realM, r.id);
  const roles = ROLE_ORDER.filter((role) => [...mock, ...real].some((s) => s.role === role));
  const blocks = [];
  for (const role of roles) {
    const realShots = real.filter((s) => s.role === role);
    const sim = realShots.some((s) => s.simulated);
    const cells = [];
    for (const w of WIDTHS) {
      const ms = mock.find((s) => s.role === role && s.width === w);
      const rs = realShots.find((s) => s.width === w);
      if (!ms && !rs) continue;
      const mockCell = r.kind === 'R'
        ? '<figure class="ph"><figcaption>mockup</figcaption><div class="missing">ไม่มีใน mockup (ความสามารถของจริงเดิม)</div></figure>'
        : ms ? figure(`mockup · ${w}`, `mockup/${ms.file}`) : '<figure class="ph"><figcaption>mockup</figcaption><div class="missing">ไม่ได้ถ่ายแถวนี้ที่ความกว้างนี้</div></figure>';
      const realCell = rs ? figure(`ของจริง · ${w}${rs.ok ? '' : ' (ถ่ายไม่สำเร็จ)'}`, `real/${rs.file}`, rs.error) : '<figure class="ph"><figcaption>ของจริง</figcaption><div class="missing">ไม่ได้ถ่ายแถวนี้ที่ความกว้างนี้</div></figure>';
      cells.push(`<div class="pair w${w}">${mockCell}${realCell}</div>`);
    }
    const realNotes = [...new Set(realShots.map((s) => s.note).filter(Boolean))];
    const redirected = realShots.filter((s) => s.final_url && r.kind !== 'R' && s.role === 'guest' && s.final_url.startsWith('/login'));
    const extra = [];
    if (sim) extra.push(`<span class="tag sim">${esc(SIM_LABEL)}</span>`);
    if (redirected.length) extra.push('<span class="tag redirect">ของจริงพาไปหน้า Login (ผู้เยี่ยมชม)</span>');
    blocks.push(`<div class="role"><h4>${esc(ROLE_LABEL[role])} ${extra.join(' ')}</h4>${cells.join('')}`
      + (realNotes.length ? `<p class="capnote">หมายเหตุการถ่าย: ${esc(realNotes.filter((n) => n !== SIM_LABEL).join(' · '))}</p>` : '') + '</div>');
  }
  const planned = r.status === 'ว่างตามแผน' || r.target === 'ว่างตามแผน';
  const removed = r.status === 'ตัดออก' || r.target === 'ตัดออก';
  const labels = [];
  if (r.status === 'ว่างตามแผน') labels.push(`<div class="label planned"><strong>ว่างตามแผน</strong> หน้า/ส่วนนี้ย้ายโครงมาแต่ไม่มีข้อมูล แสดงสถานะว่างตามที่วางแผน · เหตุผล/หมายเหตุ: ${md(r.note || 'ดูแหล่งข้อมูล')}</div>`);
  if (r.status === 'ตัดออก') labels.push(`<div class="label removed"><strong>ตัดออก</strong> ไม่ย้ายโดยตั้งใจ · เหตุผล/หมายเหตุ: ${md(r.note || 'ตามที่ผู้ใช้ตัดสินใจ')}</div>`);
  const cls = ['row', r.kind === 'R' ? 'status-R' : `status-${STATUSES.indexOf(r.status)}`].join(' ');
  return `<section class="${cls}" id="${esc(r.id)}" data-row="${esc(r.id)}" data-status="${esc(r.status)}">
<header><h3><span class="rid">${esc(r.id)}</span> ${md(r.title)}</h3>
<span class="badge s${r.kind === 'R' ? 'R' : STATUSES.indexOf(r.status)}">${esc(r.status)}</span>${planned || removed ? '' : ''}</header>
${labels.join('')}
<dl>
<dt>${r.kind === 'R' ? 'ไฟล์ในของจริง' : 'route / ไฟล์'}</dt><dd>${md(r.real)}</dd>
${r.kind === 'R' ? '' : `<dt>แหล่งข้อมูล</dt><dd>${md(r.source)}</dd><dt>สถานะเป้าหมาย</dt><dd>${esc(r.target)} · task ${esc(r.task)}</dd>`}
<dt>หมายเหตุ</dt><dd>${md(r.note) || '-'}</dd>
</dl>
${blocks.join('')}
</section>`;
}

// ---------------------------------------------------------------- สรุปส่วนบน
const pc = rows.filter((r) => r.kind !== 'R');
const rr = rows.filter((r) => r.kind === 'R');
const count = (list, s) => list.filter((r) => r.status === s).length;
const unknown = pc.filter((r) => !STATUSES.includes(r.status));
if (unknown.length) throw new Error('สถานะไม่รู้จัก: ' + unknown.map((r) => `${r.id}=${r.status}`).join(', '));
const rStatus = {};
for (const r of rr) rStatus[r.status] = (rStatus[r.status] ?? 0) + 1;

const data = readJson(path.join(OUT, 'data.json'));
let dataHtml = '<p class="warn">ไม่พบ data.json</p>';
if (data) {
  const pass = data.checks.filter((c) => c.status === 'PASS').length;
  dataHtml = `<p><strong>ผลตรวจข้อมูล (scripts/verify_migration.py): ${esc(data.result?.overall ?? data.result)} ${pass}/${data.checks.length}</strong>
 · สร้างเมื่อ ${esc(data.generated_at)} · ตัวตนที่ใช้ตรวจ id=${esc(data.identity?.id)} role=${esc(data.identity?.role)}</p>
<table class="checks"><thead><tr><th>check</th><th>เกณฑ์</th><th>ผล</th><th>สรุป</th></tr></thead><tbody>
${data.checks.map((c) => `<tr class="${c.status === 'PASS' ? 'pass' : 'fail'}"><td><code>${esc(c.check_id)}</code></td><td>${esc(c.criterion)}</td><td>${esc(c.status)}</td><td>${esc(c.summary)}</td></tr>`).join('\n')}
</tbody></table>`;
}

const blocked = realM.blocked_requests ?? [];
const idLines = Object.entries(realM.identity ?? {}).map(([role, v]) => `${role}: ${JSON.stringify(v)}${role === 'instructor' ? ' (' + SIM_LABEL + ')' : ''}`);
const css = `
:root{--bg:#f6f7fb;--fg:#1c2230;--muted:#5b6478;--card:#fff;--line:#d9deea;--ok:#157347;--bad:#b42318;--warn:#a15c00;--blue:#2750c7}
@media (prefers-color-scheme:dark){:root{--bg:#10131a;--fg:#e6e9f2;--muted:#9aa3b8;--card:#191d27;--line:#2c3243;--ok:#53c58a;--bad:#ff8a80;--warn:#f0b34a;--blue:#8aa7ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,'Noto Sans Thai',sans-serif}
main{max-width:1500px;margin:0 auto;padding:16px}h1{margin:.2em 0}h2{margin-top:1.6em}
code{background:rgba(127,127,127,.15);padding:0 4px;border-radius:4px;font-size:.9em}
.cards{display:flex;flex-wrap:wrap;gap:10px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 16px;min-width:150px}
.card b{display:block;font-size:1.8em}
table{border-collapse:collapse;width:100%;background:var(--card)}td,th{border:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top}
tr.pass td:nth-child(3){color:var(--ok);font-weight:700}tr.fail td:nth-child(3){color:var(--bad);font-weight:700}
section.row{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:16px 0}
section.row header{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
h3{margin:0;font-size:1.05em}.rid{color:var(--blue);font-weight:700}
.badge{border-radius:99px;padding:2px 12px;font-size:.85em;font-weight:700;border:1px solid var(--line)}
.s0{color:var(--ok)}.s1{color:var(--warn)}.s2{color:var(--muted)}.s3{color:var(--bad)}.sR{color:var(--blue)}
.label{border-left:5px solid;padding:6px 10px;margin:8px 0;border-radius:4px;background:rgba(127,127,127,.08)}
.label.planned{border-color:var(--warn)}.label.removed{border-color:var(--muted)}
dl{display:grid;grid-template-columns:150px 1fr;gap:2px 12px;margin:8px 0}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}
.role h4{margin:12px 0 4px}.tag{font-size:.8em;font-weight:400;border-radius:6px;padding:1px 8px;margin-left:6px;background:rgba(127,127,127,.15)}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:6px 0 10px;align-items:start}
.pair.w375{grid-template-columns:repeat(2,minmax(0,375px))}
figure{margin:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--bg)}
figcaption{font-size:.8em;color:var(--muted);padding:2px 8px}img{display:block;width:100%;height:auto}
.pair.w375 img{max-width:375px}.missing{padding:24px 10px;color:var(--muted);font-size:.9em;text-align:center}
.capnote{font-size:.85em;color:var(--muted);margin:2px 0}.warn{color:var(--warn)}
@media (max-width:800px){.pair{grid-template-columns:1fr}dl{grid-template-columns:1fr}}
`;

const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>รายงานภาพเทียบ mockup กับ VIPER จริง</title><style>${css}</style></head><body><main>
<h1>รายงานภาพเทียบ mockup กับ VIPER จริง</h1>
<p>สร้างเมื่อ ${esc(new Date().toISOString())} · ภาพจริงถ่ายเมื่อ ${esc(realM.generatedAt)} · ขนาด ${esc((realM.sizes ?? []).join(', '))} · ภาพของจริงทุกภาพบังคับธีมให้ตรงกับภาพ mockup ของแถวนั้น</p>
<h2>สรุปสถานะแถวในตารางเทียบ</h2>
<div class="cards" id="summary">
${STATUSES.map((s, i) => `<div class="card"><span class="badge s${i}">${s}</span><b data-status-count="${s}">${count(pc, s)}</b>แถว</div>`).join('\n')}
<div class="card"><span class="badge">รวมส่วนที่ 1 (P/C)</span><b>${pc.length}</b>แถว</div>
<div class="card"><span class="badge sR">ส่วนที่ 2 (R)</span><b>${rr.length}</b>แถว ${Object.entries(rStatus).map(([k, v]) => `${esc(k)} ${v}`).join(', ')}</div>
<div class="card"><span class="badge">ทุกแถว</span><b id="total-rows">${rows.length}</b>แถว</div>
</div>
<h2>ผลตรวจข้อมูล (data.json)</h2>
${dataHtml}
<h2>การถ่ายภาพของจริง</h2>
<p>ถ่าย ${realM.ok}/${realM.total} ภาพ · ตัวตนที่ยืนยันจาก <code>GET /api/auth/me</code> ก่อนถ่าย: ${idLines.map(esc).join(' · ')}</p>
<p>ทุกคำขอที่ไม่ใช่ GET ไป <code>/api/**</code> ถูกบล็อกระหว่างถ่าย: ${blocked.length} รายการ${blocked.length ? '<ul>' + blocked.map((b) => `<li>${esc(b.method)} ${esc(b.url)} (${esc(b.shot)})</li>`).join('') + '</ul>' : ''}</p>
${(realM.failed ?? []).length ? `<p class="warn">ถ่ายไม่สำเร็จ: ${realM.failed.map(esc).join(', ')}</p>` : ''}
<h2>ส่วนที่ 1: mockup เทียบของจริง (P = หน้า, C = ส่วนร่วม)</h2>
${pc.map(rowSection).join('\n')}
<h2>ส่วนที่ 2: ความสามารถเดิมของของจริง (R) ภาพคือหน้าที่เกี่ยวข้อง ยังไม่ใช่ผลทดสอบ (T23 เป็นผู้ตรวจ)</h2>
${rr.map(rowSection).join('\n')}
</main></body></html>
`;
writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');
const imgs = (html.match(/<img /g) ?? []).length;
console.log(`rows=${rows.length} (P/C ${pc.length}, R ${rr.length}) sections=${(html.match(/<section class="row/g) ?? []).length} images=${imgs}`);
console.log(STATUSES.map((s) => `${s}=${count(pc, s)}`).join(' '), 'R:', JSON.stringify(rStatus));
