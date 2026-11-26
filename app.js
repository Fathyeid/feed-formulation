(function () {
const D = FFI_DATA, E = FFI_ENGINE, I = FFI_I18N;
const ADMIN = 'fathyeid620@gmail.com';
const KEY = 'ffi_state_v1';
const ING = D.ingredients, STG = D.stages;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fx = (v, d = 2) => v == null || isNaN(v) ? '-' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function getLang() { try { const l = localStorage.getItem('suite_lang'); return l === 'ar' ? 'ar' : 'en'; } catch (e) { return 'en'; } }
let S = load();
function defaults() {
  const ing = {}; ING.forEach(i => ing[i.id] = { enabled: !i.disabled, min: i.min, max: i.max, price: i.price, local: false });
  return { route: 'work', stageId: 'broiler_starter', qty: 1000, currency: 'usd', basis: 'asfed', plantP: 0.35, name: '', ing, formula: null, manual: null, opt: null, alts: null, saved: [], scenarios: [], priceHist: [], scn: { id: 'corn', mode: 'pct', val: 10, res: null }, market: {}, inv: {}, useInv: false, conv: { c: 'corn', v: 450 }, landed: { id: 'sbm44', fob: 400, freight: 45, ins: 2, port: 12, customs: 0, inland: 15, other: 5 }, sub: { id: 'corn', res: null } };
}
function load() {
  const d = defaults();
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { Object.assign(d, s); ING.forEach(i => { if (!d.ing[i.id]) d.ing[i.id] = { enabled: !i.disabled, min: i.min, max: i.max, price: i.price, local: false }; }); } } catch (e) { }
  return d;
}
function persist(noPush) { const c = Object.assign({}, S); delete c.alts; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { } if (noPush !== true && window.FFI_PUSH && canWrite()) window.FFI_PUSH(); }
const t = k => (I[getLang()][k] != null ? I[getLang()][k] : (I.en[k] != null ? I.en[k] : k));
const L = o => o[getLang()] || o.en;
const stage = () => STG.find(s => s.id === S.stageId);
const ingName = i => getLang() === 'ar' ? i.ar : i.en;
const curLabel = () => t(S.currency);

/* ---- Sample formula and helpers ---- */
const SAMPLE = { corn: 62.8, sbm44: 30, soyoil: 3, limestone: 1.5, dcp: 1.8, salt: 0.3, premix: 0.3, lys: 0.1, met: 0.2 };
function sampleFormula() { const f = {}; ING.forEach(i => f[i.id] = SAMPLE[i.id] || 0); return f; }
function bounds() { const b = {}; const st = stage(); ING.forEach(i => { const o = S.ing[i.id]; const ov = (st.bounds || {})[i.id]; b[i.id] = { min: o.min, max: (ov && ov.max != null && o.max === i.max) ? ov.max : o.max }; if (S.useInv && i.cat !== 'premix') { const sk = S.inv[i.id] && S.inv[i.id].stock; const cap = sk > 0 ? sk / (S.qty * 1000) * 100 : 0; b[i.id].max = Math.min(b[i.id].max, cap); if (b[i.id].min > b[i.id].max) b[i.id].min = 0; } }); return b; }
function prices() { const p = {}; ING.forEach(i => p[i.id] = S.ing[i.id].price); return p; }
function enabled() { return ING.filter(i => S.ing[i.id].enabled); }
const optP = () => ({ plantPFrac: S.plantP });
function ensureFormula() { if (!S.formula) { S.formula = sampleFormula(); S.manual = Object.assign({}, S.formula); } }
function analyseCur(f) { f = f || S.formula; return E.analyse(f, ING, optP()); }

const ROWS = [['cp', '%'], ['me', 'kcal'], ['cf', '%'], ['ee', '%'], ['ca', '%'], ['avp', '%'], ['na', '%'], ['lys', '%'], ['met', '%'], ['metcys', '%'], ['thr', '%'], ['trp', '%'], ['val', '%']];
function compliance(a) {
  const st = stage(); const out = [];
  ROWS.forEach(([k, u]) => {
    const r = st.req[k]; if (!r && k !== 'ee') return; if (!r) return;
    const v = a[k]; let status = 'ok', delta = 0;
    const tol = 0.0005 * Math.max(1, Math.abs(r.min || r.max));
    if (r.min != null && v < r.min - tol) { status = 'low'; delta = r.min - v; }
    if (r.max != null && v > r.max + tol) { status = 'high'; delta = v - r.max; }
    const miss = a.missing[k] && a.missing[k].length;
    out.push({ k, u, min: r.min, max: r.max, v, status, delta, miss });
  });
  if (st.ratioCaP) { const v = a.caP; out.push({ k: 'capratio', u: '', max: st.ratioCaP, v, status: v != null && v > st.ratioCaP + 0.005 ? 'high' : 'ok', delta: v - st.ratioCaP }); }
  return out;
}
const nutFmt = (k, v) => v == null ? '-' : (k === 'me' ? fx(v, 0) : (k === 'capratio' ? fx(v, 2) : fx(v, k === 'cp' || k === 'cf' || k === 'ee' ? 2 : 3)));
function dmConv(k, v, a) { if (S.basis !== 'dm' || v == null || k === 'capratio') return v; return v / (a.dm / 100); }

/* ---- SVG charts ---- */
const PAL = ['#1F5FBF', '#C9A227', '#0B2447', '#3B8EEA', '#7A8CA5', '#2E9E6B', '#B5651D', '#8E5BD1', '#D1495B', '#4AA3A2', '#A3B18A', '#E09F3E'];
function donut(items, size = 170) {
  const tot = items.reduce((s, i) => s + i.v, 0) || 1; let ang = -Math.PI / 2; const r = size / 2 - 6, ri = r * 0.58, c = size / 2; let p = '';
  items.forEach((it, idx) => {
    const a2 = ang + it.v / tot * Math.PI * 2, large = a2 - ang > Math.PI ? 1 : 0;
    const pt = (rad, a) => [c + rad * Math.cos(a), c + rad * Math.sin(a)];
    const [x1, y1] = pt(r, ang), [x2, y2] = pt(r, a2), [x3, y3] = pt(ri, a2), [x4, y4] = pt(ri, ang);
    if (it.v / tot > 0.9999) p += `<circle cx="${c}" cy="${c}" r="${(r + ri) / 2}" fill="none" stroke="${PAL[idx % PAL.length]}" stroke-width="${r - ri}"/>`;
    else p += `<path d="M${x1} ${y1}A${r} ${r} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${ri} ${ri} 0 ${large} 0 ${x4} ${y4}Z" fill="${PAL[idx % PAL.length]}"><title>${esc(it.l)}: ${fx(it.v)}</title></path>`;
    ang = a2;
  });
  const leg = items.map((it, idx) => `<div class="lg"><i style="background:${PAL[idx % PAL.length]}"></i><span>${esc(it.l)}</span><b>${fx(it.v)}</b></div>`).join('');
  return `<div class="donutwrap"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${p}</svg><div class="legend">${leg}</div></div>`;
}
function hbars(items, fmt = v => fx(v), max) {
  const m = max || Math.max(...items.map(i => i.v), 1e-9);
  return `<div class="hb">${items.map((it, idx) => `<div class="hbr"><span class="hbl">${esc(it.l)}</span><span class="hbt"><span class="hbf" style="width:${Math.max(1, it.v / m * 100)}%;background:${it.c || PAL[idx % PAL.length]}"></span></span><b>${fmt(it.v)}</b></div>`).join('')}</div>`;
}
function pairBars(items) { // required vs formulated
  return `<div class="hb">${items.map(it => { const m = Math.max(it.req, it.v) * 1.05 || 1; return `<div class="hbr"><span class="hbl">${esc(it.l)}</span><span class="hbt"><span class="hbf" style="width:${it.v / m * 100}%;background:${it.v >= it.req - 1e-6 ? '#2E9E6B' : '#D1495B'}"></span><span class="mark" style="left:${it.req / m * 100}%"></span></span><b>${fx(it.v, 3)} / ${fx(it.req, 3)}</b></div>`; }).join('')}</div>`;
}
function lineChart(series, w = 560, h = 190) {
  const pts = series.flatMap(s => s.pts); if (!pts.length) return '';
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y); let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 === x0) x1 = x0 + 1; if (y1 === y0) { y1 = y0 * 1.05 + 1; y0 = y0 * 0.95; }
  const X = x => 40 + (x - x0) / (x1 - x0) * (w - 60), Y = y => h - 24 - (y - y0) / (y1 - y0) * (h - 44);
  let g = `<line x1="40" y1="${h - 24}" x2="${w - 20}" y2="${h - 24}" stroke="#cbd5e1"/><text x="2" y="${Y(y1) + 4}" font-size="10" fill="#64748b">${fx(y1, 0)}</text><text x="2" y="${Y(y0) + 4}" font-size="10" fill="#64748b">${fx(y0, 0)}</text>`;
  series.forEach((s, i) => { g += `<polyline fill="none" stroke="${PAL[i % PAL.length]}" stroke-width="2" points="${s.pts.map(p => X(p.x) + ',' + Y(p.y)).join(' ')}"/>` + s.pts.map(p => `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3" fill="${PAL[i % PAL.length]}"/>`).join(''); });
  const leg = series.map((s, i) => `<span class="lg"><i style="background:${PAL[i % PAL.length]}"></i>${esc(s.l)}</span>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="direction:ltr">${g}</svg><div class="legend row">${leg}</div>`;
}

/* ---- Views ---- */
const NAV = [['dash', 'nav_dash'], ['work', 'nav_work'], ['mat', 'nav_mat'], ['req', 'nav_req'], ['market', 'nav_market'], ['subst', 'nav_subst'], ['inv', 'nav_inv'], ['sup', 'nav_sup'], ['batch', 'nav_batch'], ['ai', 'nav_ai'], ['add', 'nav_add'], ['scn', 'nav_scn'], ['hist', 'nav_hist'], ['src', 'nav_src']];
function shell(body) {
  const nav = NAV.map(([k, lab]) => `<a class="nv ${S.route === k ? 'on' : ''}" data-act="route" data-v="${k}">${esc(t(lab))}</a>`).join('');
  const later = I[getLang()].later_items.map(x => `<div class="nv dis">${esc(x)} <small>${esc(t('soon'))}</small></div>`).join('');
  const role = window.FFI_USER ? (window.FFI_USER.email === ADMIN ? t('role_admin') : t('role_viewer')) : '';
  const user = window.FFI_USER ? `<span class="usr">${esc(window.FFI_USER.email)} · ${esc(role)}</span>` : `<span class="usr muted">${esc(t('login_none'))}</span>`;
  return `<header class="top"><div class="brand"><div class="logo">F</div><div><b>${esc(t('app'))}</b><small>${esc(t('sub'))}</small></div></div>
  <div class="tools">${user}<div id="gsi"></div><button class="btn ghost" data-act="lang">${esc(t('lang'))}</button></div></header>
  <div class="layout"><nav class="side">${nav}<div class="sp">${esc(t('nav_later'))}</div>${later}</nav><main class="main">${body}</main></div>`;
}

function viewWork() {
  ensureFormula();
  const st = stage(), f = S.formula, a = analyseCur(), comp = compliance(a);
  const cm = E.cost(f, ING, prices()), tot = a.total;
  const ok100 = Math.abs(tot - 100) < 0.005;
  const failing = comp.filter(c => c.status !== 'ok');
  const cpPerTon = a.cp > 0 ? cm / (a.cp / 100) : null;
  const dmAdj = k => v => v;
  // left panel
  const stageOpts = STG.map(s => `<option value="${s.id}" ${s.id === S.stageId ? 'selected' : ''}>${esc(L(s))}</option>`).join('');
  const reqRows = ROWS.map(([k, u]) => { const r = st.req[k]; if (!r) return ''; const val = r.min != null ? r.min : r.max; return `<tr><td>${esc(t('p_' + k))}</td><td class="n"><input class="in sm" data-act="req" data-k="${k}" data-b="${r.min != null ? 'min' : 'max'}" value="${val}"></td><td class="u">${r.min != null ? '≥' : '≤'} ${k === 'me' ? t('unit_me') : '%'}</td></tr>`; }).join('');
  const left = `<section class="card"><h3>${esc(t('animal'))}</h3>
   <label class="fl">${esc(t('fname'))}<input class="in" data-act="name" value="${esc(S.name)}" placeholder="${esc(L(st))}"></label>
   <label class="fl">${esc(t('animal'))}<select class="in" data-act="stage">${stageOpts}</select></label>
   <div class="g2"><label class="fl">${esc(t('qty'))}<input class="in" data-act="qty" value="${S.qty}"></label>
   <label class="fl">${esc(t('currency'))}<select class="in" data-act="cur">${['usd', 'egp', 'eur'].map(c => `<option value="${c}" ${S.currency === c ? 'selected' : ''}>${t(c)}</option>`).join('')}</select></label></div>
   <label class="fl">${esc(t('basis'))}<select class="in" data-act="basis"><option value="asfed" ${S.basis === 'asfed' ? 'selected' : ''}>${t('asfed')}</option><option value="dm" ${S.basis === 'dm' ? 'selected' : ''}>${t('dm')}</option></select></label>
   <label class="fl">${esc(t('plantp'))} <small>${esc(t('phosphorus_note'))}</small><input class="in" data-act="plantp" value="${S.plantP}"></label>
   <h4>${esc(t('requirements'))}</h4><table class="tb sm"><tbody>${reqRows}</tbody></table>
   <p class="note">${esc(L({ en: 'Source: ' + st.src, ar: 'المصدر: ' + srcAr(st) }))}</p><p class="note">${esc(t('ratio_note'))}. ${esc(t('cf_assump'))}</p></section>`;
  // center table
  const trs = ING.filter(i => S.ing[i.id].enabled || (f[i.id] || 0) > 0).map(i => {
    const o = S.ing[i.id]; const x = f[i.id] || 0; const pr = o.price; const bnd = bounds()[i.id];
    return `<tr class="${x > 0 ? '' : 'z'}"><td><input type="checkbox" data-act="en" data-id="${i.id}" ${o.enabled ? 'checked' : ''}></td>
    <td class="nm">${esc(ingName(i))} ${badge(i)}</td>
    <td><input class="in sm n" data-act="incl" data-id="${i.id}" value="${fx(x, 3)}"></td>
    <td><input class="in sm n" data-act="min" data-id="${i.id}" value="${bnd.min}"></td><td><input class="in sm n" data-act="max" data-id="${i.id}" value="${bnd.max}"></td>
    <td><input class="in sm n" data-act="price" data-id="${i.id}" value="${pr}"></td>
    <td class="n">${fx(x / 100 * S.qty * 1000, 0)}</td><td class="n">${fx(x / 100 * pr)}</td><td class="n">${cm ? fx(x / 100 * pr / cm * 100, 1) + '%' : '-'}</td>
    <td><input type="checkbox" data-act="local" data-id="${i.id}" ${o.local ? 'checked' : ''}></td></tr>`;
  }).join('');
  const addable = ING.filter(i => !S.ing[i.id].enabled && (f[i.id] || 0) === 0);
  const addSel = addable.length ? `<select class="in sm" data-act="add"><option value="">+ ${esc(t('ingredient'))}</option>${addable.map(i => `<option value="${i.id}">${esc(ingName(i))}</option>`).join('')}</select>` : '';
  const optMsg = S.opt ? (S.opt.status === 'optimal' ? `<div class="banner ok">${esc(t('opt_done'))}: ${fx(S.opt.before)} → <b>${fx(S.opt.cost)}</b> ${esc(curLabel())}/MT${S.opt.beforeOk ? ' · ' + esc(t('saving_1000')) + ': <b>' + fx((S.opt.before - S.opt.cost) * 1000, 0) + '</b> ' + esc(curLabel()) : '<br><small>' + esc(t('orig_bad')) + '</small>'}</div>` : `<div class="banner bad">${esc(S.opt.status === 'unbounded' ? t('unbounded') : t('infeasible'))}${S.useInv ? '<br><small>' + esc(t('inv_hint')) + '</small>' : ''}</div>`) : '';
  const center = `<section class="card wide"><div class="bar"><button class="btn gold" data-act="optimize">⚡ ${esc(t('optimize'))}</button><button class="btn" data-act="normalize">${esc(t('normalize'))}</button><button class="btn ghost" data-act="resetf">${esc(t('reset'))}</button><button class="btn" data-act="save">${esc(t('save'))}</button>${addSel}</div>${optMsg}
   <div class="scroll"><table class="tb"><thead><tr><th></th><th>${esc(t('ingredient'))}</th><th>${esc(t('incl'))}</th><th>${esc(t('minp'))}</th><th>${esc(t('maxp'))}</th><th>${esc(t('price'))} (${esc(curLabel())})</th><th>${esc(t('kgs'))}</th><th>${esc(t('cost'))}</th><th>${esc(t('share'))}</th><th>${esc(t('local'))}</th></tr></thead><tbody>${trs}</tbody>
   <tfoot><tr><td></td><td><b>${esc(t('total'))}</b></td><td class="n ${ok100 ? '' : 'bad'}"><b>${fx(tot, 3)}</b></td><td></td><td></td><td></td><td class="n"><b>${fx(S.qty * 1000, 0)}</b></td><td class="n"><b>${fx(cm)}</b></td><td></td><td></td></tr></tfoot></table></div>
   <p class="note">${esc(t('max_note'))} ${esc(t('price_note'))}</p></section>`;
  // right panel
  const rows = comp.map(c => {
    const req = c.min != null ? c.min : c.max; const pct = req ? Math.min(150, c.v / req * 100) : 0;
    const cls = c.status === 'ok' ? 'ok' : 'bad';
    const v = dmConv(c.k, c.v, a), rq = dmConv(c.k, req, a);
    return `<tr><td>${esc(t('p_' + c.k))}</td><td class="n">${c.min != null ? '≥' : '≤'} ${nutFmt(c.k, rq)}</td><td class="n"><b>${nutFmt(c.k, v)}</b></td><td><span class="pill ${cls}">${c.status === 'ok' ? '✓ ' + esc(t('ok')) : esc(t(c.status)) + ' ' + nutFmt(c.k, c.delta)}</span>${c.miss ? ' <span class="pill warn" title="' + esc(t('missing_title')) + '">!</span>' : ''}</td></tr>`;
  }).join('');
  const bars = comp.filter(c => c.min != null && c.k !== 'capratio').map(c => `<div class="cb"><span>${esc(t('p_' + c.k))}</span><span class="cbt"><span class="cbf ${c.status === 'ok' ? 'ok' : 'bad'}" style="width:${Math.min(100, c.v / c.min * 100)}%"></span></span><b>${fx(c.v / c.min * 100, 0)}%</b></div>`).join('');
  // alerts
  const alerts = failing.map(c => {
    const helpers = helpIngredients(c.k, c.status === 'low');
    return `<li class="al"><b>${esc(t('p_' + c.k))}</b>: ${esc(t(c.status))} ${nutFmt(c.k, c.delta)} ${c.k === 'me' ? t('unit_me') : (c.k === 'capratio' ? '' : '%')}${helpers.length && c.status === 'low' ? `<br><small>${esc(t('can_help'))}: ${helpers.map(esc).join('، ')}</small>` : ''}</li>`;
  });
  if (!ok100) alerts.unshift(`<li class="al"><b>${esc(t('total_incl'))}</b>: ${fx(tot, 3)}%. ${esc(t('not100'))}</li>`);
  const miss = Object.keys(a.missing).filter(k => a.missing[k].length && st.req[k]).map(k => `${t('p_' + k)}: ${[...new Set(a.missing[k])].map(id => ingName(ING.find(i => i.id === id))).join(', ')}`);
  const statusLine = (failing.length || !ok100) ? `<div class="banner bad">✖ ${esc(t('approve_block'))}</div>` : `<div class="banner ok">✓ ${esc(t('approved_ok'))}</div>`;
  const right = `<section class="card"><div class="kpis"><div class="kpi"><small>${esc(t('cost_mt'))}</small><b>${fx(cm)}</b><em>${esc(curLabel())}</em></div><div class="kpi"><small>${esc(t('total_cost'))}</small><b>${fx(cm * S.qty, 0)}</b><em>${esc(curLabel())}</em></div><div class="kpi"><small>${esc(t('cost_cp'))}</small><b>${fx(cpPerTon, 0)}</b><em>${esc(curLabel())}</em></div></div>
   ${statusLine}<h4>${esc(t('requirements'))}</h4><table class="tb sm"><thead><tr><th>${esc(t('param'))}</th><th>${esc(t('required'))}</th><th>${esc(t('formulated'))}</th><th>${esc(t('status'))}</th></tr></thead><tbody>${rows}</tbody></table>
   <h4>${esc(t('alerts'))}</h4>${alerts.length ? `<ul class="als">${alerts.join('')}</ul>` : `<p class="note">${esc(t('no_alerts'))}</p>`}
   ${miss.length ? `<p class="note warnt"><b>${esc(t('missing_title'))}.</b> ${esc(t('missing_msg'))}<br>${miss.map(esc).join('<br>')}</p>` : ''}
   <p class="note">${esc(t('review_note'))}</p></section>`;
  // bottom
  const used = ING.filter(i => (f[i.id] || 0) > 0.0005).sort((p, q) => f[q.id] - f[p.id]);
  const mix = donut(used.map(i => ({ l: ingName(i), v: f[i.id] })));
  const costb = hbars(used.map(i => ({ l: ingName(i), v: f[i.id] / 100 * S.ing[i.id].price })).sort((p, q) => q.v - p.v).slice(0, 10), v => fx(v));
  const aaItems = ['lys', 'met', 'metcys', 'thr', 'trp', 'val'].filter(k => st.req[k]).map(k => ({ l: t('p_' + k), req: st.req[k].min, v: a[k] }));
  const batchRows = used.map(i => { const need = f[i.id] / 100 * S.qty * 1000, sk = S.inv[i.id] && S.inv[i.id].stock; const short = sk != null && sk !== '' && need > sk + 0.5; return `<tr><td>${esc(ingName(i))}${short ? ' <span class="pill bad">' + esc(t('short')) + ' ' + fx(need - sk, 0) + ' kg</span>' : ''}</td><td class="n">${fx(f[i.id], 3)}%</td><td class="n">${fx(need, 0)}</td><td class="n">${fx(f[i.id] / 100 * S.qty * S.ing[i.id].price, 0)}</td></tr>`; }).join('');
  const bind = S.opt && S.opt.status === 'optimal' ? bindingHtml(S.opt) : '';
  const bottom = `<div class="grid3"><section class="card"><h3>${esc(t('mix'))}</h3>${mix}</section><section class="card"><h3>${esc(t('cost_break'))} (${esc(curLabel())}/MT)</h3>${costb}</section><section class="card"><h3>${esc(t('aa_chart'))}</h3>${pairBars(aaItems)}<h3 style="margin-top:14px">${esc(t('requirements'))}</h3>${bars}</section></div>
   <div class="grid2"><section class="card"><h3>${esc(t('alt'))}</h3><div class="bar"><button class="btn" data-act="alts">${esc(t('alt_run'))}</button></div>${altsHtml()}</section>
   <section class="card"><h3>${esc(t('batch'))}</h3><p class="note">${esc(t('batch_note'))}: ${fx(S.qty, 0)} MT</p><table class="tb sm"><thead><tr><th>${esc(t('ingredient'))}</th><th>%</th><th>kg</th><th>${esc(curLabel())}</th></tr></thead><tbody>${batchRows}</tbody></table></section></div>${bind}`;
  return `<div class="ws"><div class="wsl">${left}</div><div class="wsc">${center}</div><div class="wsr">${right}</div></div>${bottom}`;
}
function srcAr(o) { return o.srcAr || o.src; }
function badge(i) { const k = i.status; return `<span class="bdg ${k}" title="${esc(t('st_' + k))}">${esc(t('st_' + k))}</span>`; }
function helpIngredients(k, low) {
  const en = enabled(); const ranked = en.map(i => { const c = E.composition(i, optP()); return { i, d: c[k] == null ? 0 : c[k] / (S.ing[i.id].price || 1) }; }).filter(x => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 3);
  return ranked.map(x => ingName(x.i));
}
function bindingHtml(o) {
  const name = b => b.k ? (b.kind === 'min-nutrient' ? '≥ ' : '≤ ') + t('p_' + b.k) : (b.kind === 'max' ? ingName(ING.find(i => i.id === b.id)) + ' ≤ max' : b.kind === 'min' ? ingName(ING.find(i => i.id === b.id)) + ' ≥ min' : t('p_capratio'));
  const rows = o.binding.map(b => `<tr><td>${esc(name(b))}</td><td class="n">${fx(b.dual, 3)}</td></tr>`).join('');
  const unused = ING.filter(i => S.ing[i.id].enabled && (S.formula[i.id] || 0) < 0.0005).map(i => ingName(i)).join('، ') || '-';
  return `<section class="card"><h3>${esc(t('binding'))}</h3><p class="note">${esc(t('shadow_note'))} (${esc(curLabel())}/MT)</p><table class="tb sm"><tbody>${rows}</tbody></table><p class="note"><b>${esc(t('unused'))}:</b> ${esc(unused)}</p></section>`;
}
function altsHtml() {
  if (!S.alts) return '';
  const rows = S.alts.map((r, idx) => {
    if (r.note) return `<tr><td>${esc(t(r.key))}</td><td colspan="6" class="note">${esc(t(r.note))}</td></tr>`;
    if (r.status !== 'optimal') return `<tr><td>${esc(t(r.key))}</td><td colspan="6" class="note">${esc(t('infeasible'))}</td></tr>`;
    return `<tr><td>${esc(t(r.key))}</td><td class="n"><b>${fx(r.cost)}</b></td><td class="n">${fx(r.a.cp, 2)}</td><td class="n">${fx(r.a.me, 0)}</td><td class="n">${fx(r.a.lys, 3)}</td><td class="n">${r.n}</td><td><button class="btn sm2" data-act="applyalt" data-v="${idx}">${esc(t('apply'))}</button></td></tr>`;
  }).join('');
  return `<div class="scroll"><table class="tb sm"><thead><tr><th></th><th>${esc(t('cost_mt'))}</th><th>CP%</th><th>ME</th><th>Lys%</th><th>${esc(t('n_ing'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function viewMat() {
  const rows = ING.map(i => {
    const c = E.composition(i, optP()); const o = S.ing[i.id];
    return `<tr><td><b>${esc(ingName(i))}</b><br><small class="muted">${esc(i.id.toUpperCase())}</small></td><td>${esc(t('cat_' + i.cat))}</td>
    <td class="n">${fx(c.dm, 1)}</td><td class="n">${fx(c.cp, 1)}</td><td class="n">${fx(c.cf, 1)}</td><td class="n">${fx(c.ee, 1)}</td><td class="n">${fx(c.ca, 2)}</td><td class="n">${fx(c.p, 2)}</td><td class="n">${fx(c.lys, 2)}</td><td class="n">${fx(c.me, 0)}</td>
    <td class="n">${fx(o.price, 0)}<br><small class="warnt">${esc(t('pstat_placeholder'))}</small></td><td>${badge(i)}</td><td class="srcc">${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(L({ en: i.src, ar: srcAr(i) }).slice(0, 140))}</a>` : esc(L({ en: i.src, ar: srcAr(i) }).slice(0, 220))}</td></tr>`;
  }).join('');
  return `<section class="card"><h3>${esc(t('mat_title'))} (${ING.length})</h3><p class="note">${esc(L({ en: 'All values are per kg as-fed, derived from the source table. Energy = AMEn for broilers (MJ/kg DM x 239.006 x DM). Origin/supplier-specific lab values can be added later.', ar: 'كل القيم لكل كجم كما هو، محسوبة من جدول المصدر. الطاقة = AMEn للدجاج اللاحم (ميجاجول/كجم مادة جافة × 239.006 × المادة الجافة). يمكن لاحقاً إضافة تحاليل المعمل حسب المنشأ والمورد.' }))}</p>
  <div class="scroll"><table class="tb sm"><thead><tr><th>${esc(t('ingredient'))}</th><th>${esc(t('category'))}</th><th>DM%</th><th>CP%</th><th>CF%</th><th>EE%</th><th>Ca%</th><th>P%</th><th>Lys%</th><th>ME kcal/kg</th><th>${esc(t('price'))}</th><th>${esc(t('verification'))}</th><th>${esc(t('source'))}</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
function viewReq() {
  const rows = STG.map(s => `<tr><td><b>${esc(L(s))}</b></td>${['cp', 'me', 'cf', 'ca', 'avp', 'na', 'lys', 'met', 'metcys', 'thr', 'trp', 'val'].map(k => `<td class="n">${s.req[k] ? (s.req[k].min != null ? s.req[k].min : '≤' + s.req[k].max) : '-'}</td>`).join('')}<td class="srcc"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(L({ en: s.src, ar: srcAr(s) }).slice(0, 150))}</a></td></tr>`).join('');
  return `<section class="card"><h3>${esc(t('req_title'))}: ${esc(t('poultry'))}</h3><div class="scroll"><table class="tb sm"><thead><tr><th>${esc(t('animal'))}</th><th>CP%</th><th>ME</th><th>CF%max</th><th>Ca%</th><th>avP%</th><th>Na%</th><th>Lys%</th><th>Met%</th><th>M+C%</th><th>Thr%</th><th>Trp%</th><th>Val%</th><th>${esc(t('source'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="note">${esc(t('stage_pending'))}</p><p class="note">${esc(t('cf_assump'))}</p></section>`;
}
function viewScn() {
  ensureFormula();
  const sc = S.scn; const en = ING.filter(i => S.ing[i.id].enabled);
  const sel = en.map(i => `<option value="${i.id}" ${sc.id === i.id ? 'selected' : ''}>${esc(ingName(i))}</option>`).join('');
  let res = '';
  if (sc.res) {
    const r = sc.res; res = `<div class="kpis"><div class="kpi"><small>${esc(t('scn_prev'))}</small><b>${fx(r.prev)}</b></div><div class="kpi"><small>${esc(t('scn_stay'))}</small><b>${fx(r.stay)}</b><em>${r.stay - r.prev >= 0 ? '+' : ''}${fx(r.stay - r.prev)}</em></div><div class="kpi"><small>${esc(t('scn_reopt'))}</small><b>${r.status === 'optimal' ? fx(r.reopt) : '-'}</b><em>${r.status === 'optimal' ? (r.reopt - r.prev >= 0 ? '+' : '') + fx(r.reopt - r.prev) : ''}</em></div></div>
    ${r.status === 'optimal' ? `<h4>${esc(t('scn_chg'))}</h4>${hbars(r.changes.map(c => ({ l: ingName(ING.find(i => i.id === c.id)), v: Math.abs(c.d), c: c.d >= 0 ? '#2E9E6B' : '#D1495B' })), v => fx(v, 2) + '%')}<p class="note">${r.changes.map(c => `${esc(ingName(ING.find(i => i.id === c.id)))}: ${fx(c.a, 2)} → ${fx(c.b, 2)}`).join(' · ')}</p>` : `<div class="banner bad">${esc(t('infeasible'))}</div>`}
    <div class="bar"><button class="btn" data-act="scnsave">${esc(t('scn_save'))}</button></div>`;
  }
  const saved = S.scenarios.length ? `<h4>${esc(t('scn_saved'))}</h4><table class="tb sm"><thead><tr><th></th><th>${esc(t('scn_prev'))}</th><th>${esc(t('scn_stay'))}</th><th>${esc(t('scn_reopt'))}</th></tr></thead><tbody>${S.scenarios.map(s => `<tr><td>${esc(s.label)}</td><td class="n">${fx(s.prev)}</td><td class="n">${fx(s.stay)}</td><td class="n">${s.reopt != null ? fx(s.reopt) : '-'}</td></tr>`).join('')}</tbody></table>` : '';
  return `<section class="card"><h3>${esc(t('scn_title'))}</h3><p class="note">${esc(t('scn_hint'))}</p><div class="bar"><label class="fl">${esc(t('scn_ing'))}<select class="in" data-act="scn-id">${sel}</select></label>
   <label class="fl">${esc(t('scn_mode'))}<select class="in" data-act="scn-mode"><option value="pct" ${sc.mode === 'pct' ? 'selected' : ''}>${esc(t('scn_pct'))}</option><option value="abs" ${sc.mode === 'abs' ? 'selected' : ''}>${esc(t('scn_abs'))}</option></select></label>
   <label class="fl">${esc(t('scn_val'))}<input class="in sm" data-act="scn-val" value="${sc.val}"></label><button class="btn gold" data-act="scnrun">${esc(t('scn_run'))}</button></div>${res}${saved}</section>`;
}
function viewHist() {
  const rows = S.saved.map((s, idx) => `<tr><td>${esc(s.name || s.stageLabel[getLang()])}</td><td>${esc(s.stageLabel[getLang()])}</td><td>${esc(t('version'))} ${s.version}</td><td class="n">${fx(s.cost)} ${esc(t(s.currency))}</td><td class="n">${fx(s.a.cp, 2)}</td><td class="n">${fx(s.a.me, 0)}</td><td><select class="in sm" data-act="sstatus" data-v="${idx}">${['draft', 'review', 'approved', 'rejected', 'archived'].map(k => `<option value="${k}" ${s.status === k ? 'selected' : ''} ${k === 'approved' && !s.compliant ? 'disabled' : ''}>${esc(t('status_' + k))}</option>`).join('')}</select></td><td>${esc(new Date(s.at).toLocaleString(getLang() === 'ar' ? 'ar-EG' : 'en-GB'))}</td><td><button class="btn sm2" data-act="sload" data-v="${idx}">${esc(t('load'))}</button> <button class="btn sm2 ghost" data-act="sdel" data-v="${idx}">${esc(t('del'))}</button></td></tr>`).join('');
  return `<section class="card"><h3>${esc(t('hist_title'))}</h3>${S.saved.length ? `<div class="scroll"><table class="tb sm"><thead><tr><th></th><th>${esc(t('animal'))}</th><th>${esc(t('version'))}</th><th>${esc(t('cost_mt'))}</th><th>CP%</th><th>ME</th><th>${esc(t('status'))}</th><th>${esc(t('created'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="note">${esc(t('hist_empty'))}</p>`}
  <h3>${esc(t('exports'))}</h3><div class="bar"><button class="btn" data-act="csv">${esc(t('export_csv'))}</button><button class="btn ghost" data-act="print">${esc(t('export_print'))}</button></div></section>`;
}
function viewDash() {
  const sv = S.saved; const costs = sv.map(s => s.cost);
  const nm = S.formula ? E.cost(S.formula, ING, prices()) : null;
  const save = S.opt && S.opt.status === 'optimal' ? S.opt.before - S.opt.cost : null;
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const k = (l, v, u) => `<div class="kpi"><small>${esc(l)}</small><b>${v}</b>${u ? `<em>${esc(u)}</em>` : ''}</div>`;
  const cur = curLabel();
  const bars = sv.length ? hbars(sv.map(s => ({ l: (s.name || s.stageLabel[getLang()]) + ' v' + s.version, v: s.cost })), v => fx(v)) : `<p class="note">${esc(t('hist_empty'))}</p>`;
  // trend
  const byId = {}; S.priceHist.forEach(h => { (byId[h.id] = byId[h.id] || []).push(h); });
  const series = Object.keys(byId).slice(0, 6).map(id => ({ l: ingName(ING.find(i => i.id === id)), pts: byId[id].map(h => ({ x: h.t, y: h.price })) }));
  const trend = series.length ? lineChart(series) : `<p class="note">${esc(t('dash_nodata'))}</p>`;
  return `<div class="kpis big">${k(t('kpi_total'), sv.length)}${k(t('kpi_approved'), sv.filter(s => s.status === 'approved').length)}${k(t('kpi_review'), sv.filter(s => s.status === 'review' || !s.compliant).length)}${k(t('kpi_mats'), ING.length)}${k(t('kpi_avgcost'), costs.length ? fx(avg(costs)) : '-', cur)}${k(t('kpi_low'), costs.length ? fx(Math.min(...costs)) : '-', cur)}${k(t('kpi_cp'), sv.length ? fx(avg(sv.map(s => s.a.cp)), 2) + '%' : '-')}${k(t('kpi_me'), sv.length ? fx(avg(sv.map(s => s.a.me)), 0) : '-', t('unit_me'))}${k(t('kpi_qty'), fx(sv.reduce((x, s) => x + s.qty, 0), 0))}${k(t('kpi_saving'), save != null ? fx(save) : '-', cur)}</div>
  <div class="grid2"><section class="card"><h3>${esc(t('dash_cost'))}</h3>${bars}</section><section class="card"><h3>${esc(t('dash_trend'))}</h3>${trend}</section></div>
  <section class="card"><p class="note">${esc(t('stage_info'))}</p></section>`;
}

const PTYPES = ['cbot', 'fob', 'cif', 'local', 'offer', 'contract', 'placeholder'];
const CONV = { corn: { l: ['Corn (CBOT, cents/bushel)', 'ذرة (CBOT، سنت/بوشل)'], f: v => v / 100 * 39.3683 }, wheat: { l: ['Wheat (CBOT, cents/bushel)', 'قمح (CBOT، سنت/بوشل)'], f: v => v / 100 * 36.7437 }, sbm: { l: ['Soybean meal (CBOT, USD/short ton)', 'كسب صويا (CBOT، دولار/طن قصير)'], f: v => v * 1.102311 }, soyoil: { l: ['Soybean oil (CBOT, cents/lb)', 'زيت صويا (CBOT، سنت/رطل)'], f: v => v / 100 * 2204.62 } };
function viewMarket() {
  const ar = getLang() === 'ar', cv = CONV[S.conv.c] || CONV.corn; const lc = S.landed;
  const landed = ['fob', 'freight', 'ins', 'port', 'customs', 'inland', 'other'].reduce((s, k) => s + (Number(lc[k]) || 0), 0);
  const ingSel = id => ING.map(i => `<option value="${i.id}" ${id === i.id ? 'selected' : ''}>${esc(ingName(i))}</option>`).join('');
  const lf = (k, lab) => `<label class="fl">${esc(t(lab))}<input class="in sm" data-act="ld" data-k="${k}" value="${lc[k]}"></label>`;
  const rows = ING.map(i => { const m = S.market[i.id] || { type: 'placeholder' }; return `<tr><td>${esc(ingName(i))}</td><td class="n">${fx(S.ing[i.id].price, 2)}</td><td><select class="in sm" data-act="ptype" data-id="${i.id}">${PTYPES.map(k => `<option value="${k}" ${(m.type || 'placeholder') === k ? 'selected' : ''}>${esc(t('pt_' + k))}</option>`).join('')}</select></td><td><input class="in sm" style="width:120px" data-act="pdate" data-id="${i.id}" type="date" value="${esc(m.date || '')}"></td><td><input class="in" data-act="pnote" data-id="${i.id}" value="${esc(m.note || '')}" placeholder="${esc(t('pnote_ph'))}"></td><td>${m.type === 'cbot' ? `<span class="pill warn">${esc(t('cbot_warn'))}</span>` : ''}</td></tr>`; }).join('');
  return `<section class="card"><h3>${esc(t('conv_title'))}</h3><p class="note">${esc(t('conv_note'))}</p><div class="bar"><label class="fl">${esc(t('commodity'))}<select class="in" data-act="conv-c">${Object.keys(CONV).map(k => `<option value="${k}" ${S.conv.c === k ? 'selected' : ''}>${esc(CONV[k].l[ar ? 1 : 0])}</option>`).join('')}</select></label><label class="fl">${esc(t('quote'))}<input class="in sm" data-act="conv-v" value="${S.conv.v}"></label><div class="kpi"><small>USD / MT</small><b>${fx(cv.f(Number(S.conv.v)))}</b></div></div><p class="note warnt">${esc(t('cbot_warn_long'))}</p></section>
  <section class="card"><h3>${esc(t('landed_title'))}</h3><div class="bar"><label class="fl">${esc(t('ingredient'))}<select class="in" data-act="ld-id">${ingSel(lc.id)}</select></label>${lf('fob', 'ld_fob')}${lf('freight', 'ld_freight')}${lf('ins', 'ld_ins')}${lf('port', 'ld_port')}${lf('customs', 'ld_customs')}${lf('inland', 'ld_inland')}${lf('other', 'ld_other')}<div class="kpi"><small>${esc(t('landed'))}</small><b>${fx(landed)}</b><em>USD/MT</em></div><button class="btn gold" data-act="ld-use">${esc(t('use_price'))}</button></div><p class="note">${esc(t('landed_note'))}</p></section>
  <section class="card"><h3>${esc(t('pricebook'))}</h3><div class="scroll"><table class="tb sm"><thead><tr><th>${esc(t('ingredient'))}</th><th>${esc(t('price'))}</th><th>${esc(t('ptype'))}</th><th>${esc(t('pdate'))}</th><th>${esc(t('pnote'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><p class="note">${esc(t('live_note'))}</p></section>`;
}
function viewSubst() {
  ensureFormula(); const ar = getLang() === 'ar'; const f = S.formula;
  const used = ING.filter(i => f[i.id] > 0.0005 && !['mineral', 'amino', 'premix'].includes(i.cat));
  if (!used.find(i => i.id === S.sub.id) && used.length) S.sub.id = used[0].id;
  let res = '';
  if (S.sub.res) { const r = S.sub.res; res = `<p class="note">${esc(t('sub_base'))}: ${fx(r.base)} · ${esc(t('sub_x'))}: <b>${esc(ingName(ING.find(i => i.id === S.sub.id)))}</b> ${fx(f[S.sub.id], 2)}%</p><div class="scroll"><table class="tb sm"><thead><tr><th>${esc(t('sub_cand'))}</th><th>${esc(t('sub_swap'))}</th><th>${esc(t('sub_swapok'))}</th><th>${esc(t('sub_reopt'))}</th><th>CP</th><th>ME</th><th>Lys</th></tr></thead><tbody>${r.rows.map(x => `<tr><td>${esc(ingName(ING.find(i => i.id === x.id)))}</td><td class="n">${x.swapCost >= 0 ? '+' : ''}${fx(x.swapCost)}</td><td>${x.fail.length ? '<span class="pill bad">' + x.fail.map(k => esc(t('p_' + k))).join(', ') + '</span>' : '<span class="pill ok">✓</span>'}</td><td class="n">${x.reopt != null ? fx(x.reopt) + ' (' + (x.reopt - r.base >= 0 ? '+' : '') + fx(x.reopt - r.base) + ')' : esc(t('infeasible_short'))}</td><td class="n">${x.dcp >= 0 ? '+' : ''}${fx(x.dcp, 2)}</td><td class="n">${x.dme >= 0 ? '+' : ''}${fx(x.dme, 0)}</td><td class="n">${x.dlys >= 0 ? '+' : ''}${fx(x.dlys, 3)}</td></tr>`).join('')}</tbody></table></div><p class="note">${esc(t('sub_rule'))}</p>`; }
  return `<section class="card"><h3>${esc(t('subst_title'))}</h3><p class="note">${esc(t('subst_note'))}</p><div class="bar"><label class="fl">${esc(t('sub_x'))}<select class="in" data-act="sub-id">${used.map(i => `<option value="${i.id}" ${S.sub.id === i.id ? 'selected' : ''}>${esc(ingName(i))} (${fx(f[i.id], 1)}%)</option>`).join('')}</select></label><button class="btn gold" data-act="subrun">${esc(t('sub_run'))}</button></div>${res}</section>`;
}
function runSubst() {
  const st = stage(), x = S.sub.id, f = S.formula, P = prices();
  const base = E.cost(f, ING, P), a0 = analyseCur(f); const rows = [];
  enabled().filter(i => i.id !== x && !['mineral', 'amino', 'premix'].includes(i.cat)).forEach(b => {
    const f2 = Object.assign({}, f); f2[b.id] = (f2[b.id] || 0) + f2[x]; f2[x] = 0;
    const a2 = analyseCur(f2); const fail = compliance(a2).filter(c => c.status !== 'ok').map(c => c.k);
    const bd = bounds(); const bd2 = Object.assign({}, bd); bd2[x] = { min: 0, max: 0 }; ING.forEach(i => { if (i.id !== b.id && i.id !== x && !(f[i.id] > 0.0005)) bd2[i.id] = { min: 0, max: 0 }; });
    // re-optimize with x excluded but candidate b allowed
    const r = E.optimize({ ings: enabled(), bounds: bd2, req: st.req, prices: P, opt: optP(), ratioCaP: st.ratioCaP });
    rows.push({ id: b.id, swapCost: E.cost(f2, ING, P) - base, fail, reopt: r.status === 'optimal' ? r.cost : null, dcp: a2.cp - a0.cp, dme: a2.me - a0.me, dlys: a2.lys - a0.lys });
  });
  rows.sort((p, q) => (p.fail.length - q.fail.length) || (p.swapCost - q.swapCost));
  S.sub.res = { base, rows: rows.slice(0, 12) };
}
function viewInv() {
  const rows = ING.map(i => { const v = S.inv[i.id] || {}; return `<tr><td>${esc(ingName(i))}</td><td><input class="in sm" style="width:110px" data-act="inv-stock" data-id="${i.id}" value="${v.stock != null ? v.stock : ''}"></td><td><input class="in" data-act="inv-sup" data-id="${i.id}" value="${esc(v.supplier || '')}"></td><td><input class="in" data-act="inv-wh" data-id="${i.id}" value="${esc(v.wh || '')}"></td><td><input class="in sm" data-act="inv-in" data-id="${i.id}" value="${v.incoming != null ? v.incoming : ''}"></td></tr>`; }).join('');
  return `<section class="card"><h3>${esc(t('inv_title'))}</h3><p class="note">${esc(t('inv_note'))}</p><label class="fl" style="max-width:420px"><input type="checkbox" data-act="useinv" ${S.useInv ? 'checked' : ''}> ${esc(t('inv_use'))}</label><div class="scroll"><table class="tb sm"><thead><tr><th>${esc(t('ingredient'))}</th><th>${esc(t('inv_stock'))}</th><th>${esc(t('inv_sup'))}</th><th>${esc(t('inv_wh'))}</th><th>${esc(t('inv_incoming'))}</th></tr></thead><tbody>${rows}</tbody></table></div><p class="note warnt">${esc(t('inv_manual'))}</p></section>`;
}


function viewSup() {
  S.quotes = S.quotes || []; const qf = S.qf = S.qf || { id: ING[0].id, sup: '', price: '', date: new Date().toISOString().slice(0, 10), lead: '', moq: '' };
  const f = S.formula || sampleFormula();
  const by = {}; S.quotes.forEach((q, idx) => { (by[q.id] = by[q.id] || []).push(Object.assign({ idx }, q)); });
  const groups = Object.keys(by).map(id => { const i = ING.find(x => x.id === id); const qs = by[id].sort((x, y) => x.price - y.price); const cur = S.ing[id].price;
    return `<tr class="grp"><td colspan="7"><b>${esc(ingName(i))}</b> <small>${esc(t('cur_price'))}: ${fx(cur)}</small> <button class="btn sm2" data-act="quse" data-id="${id}" data-v="${qs[0].idx}">${esc(t('use_best'))}</button></td></tr>` +
      qs.map((q, k) => `<tr class="${k === 0 ? 'best' : ''}"><td></td><td>${esc(q.sup)}${k === 0 ? ' <span class="pill ok">' + esc(t('best')) + '</span>' : ''}</td><td class="n">${fx(q.price)}</td><td class="n">${k ? '+' + fx(q.price - qs[0].price) : '-'}</td><td>${esc(q.date || '')}</td><td class="n">${q.lead === '' || q.lead == null ? '-' : q.lead} / ${q.moq === '' || q.moq == null ? '-' : q.moq}</td><td><button class="btn sm2 ghost" data-act="qdel" data-v="${q.idx}">${esc(t('del'))}</button></td></tr>`).join(''); }).join('');
  let tot0 = 0, tot1 = 0; const rec = ING.filter(i => f[i.id] > 0 && by[i.id]).map(i => { const q = by[i.id].slice().sort((x, y) => x.price - y.price)[0]; const mt = f[i.id] / 100 * S.qty; const c0 = mt * S.ing[i.id].price, c1 = mt * q.price; tot0 += c0; tot1 += c1;
    const lowMoq = q.moq !== '' && q.moq != null && mt < q.moq; return `<tr><td>${esc(ingName(i))}</td><td>${esc(q.sup)}</td><td class="n">${fx(mt, 3)}</td><td class="n">${fx(q.price)}</td><td class="n">${fx(c1, 0)}</td><td class="n">${fx(c1 - c0, 0)}</td><td>${lowMoq ? '<span class="pill bad">' + esc(t('below_moq')) + '</span>' : ''}</td></tr>`; }).join('');
  const inp = (k, ph, w) => `<label class="fl">${esc(t(ph))}<input class="in ${w ? '' : 'sm'}" data-act="qf" data-k="${k}" value="${esc(qf[k])}" ${k === 'date' ? 'type="date"' : ''}></label>`;
  const idSel = `<label class="fl">${esc(t('ingredient'))}<select class="in" data-act="qf" data-k="id">${ING.map(i => `<option value="${i.id}" ${qf.id === i.id ? 'selected' : ''}>${esc(ingName(i))}</option>`).join('')}</select></label>`;
  return `<section class="card"><h3>${esc(t('sup_title'))}</h3><p class="note">${esc(t('sup_note'))}</p><div class="bar">${idSel}${inp('sup', 'sup_name', 1)}${inp('price', 'sup_price')}${inp('date', 'price_date')}${inp('lead', 'lead_days')}${inp('moq', 'moq_mt')}<button class="btn gold" data-act="qadd">${esc(t('add_quote'))}</button></div></section>
  <section class="card"><h3>${esc(t('sup_compare'))}</h3>${groups ? `<div class="scroll"><table class="tb sm"><thead><tr><th></th><th>${esc(t('sup_name'))}</th><th>USD/MT</th><th>${esc(t('vs_best'))}</th><th>${esc(t('price_date'))}</th><th>${esc(t('lead_days'))} / MOQ</th><th></th></tr></thead><tbody>${groups}</tbody></table></div>` : `<p class="note">${esc(t('no_quotes'))}</p>`}</section>
  <section class="card"><h3>${esc(t('proc_title'))}</h3><p class="note">${esc(t('proc_note'))}: ${fx(S.qty, 0)} MT</p>${rec ? `<div class="scroll"><table class="tb sm"><thead><tr><th>${esc(t('ingredient'))}</th><th>${esc(t('sup_name'))}</th><th>MT</th><th>USD/MT</th><th>USD</th><th>${esc(t('vs_cur'))}</th><th></th></tr></thead><tbody>${rec}</tbody><tfoot><tr><td colspan="4"><b>${esc(t('total_quoted'))}</b></td><td class="n"><b>${fx(tot1, 0)}</b></td><td class="n"><b>${fx(tot1 - tot0, 0)}</b></td><td></td></tr></tfoot></table></div><p class="note">${esc(t('proc_cover'))}</p>` : `<p class="note">${esc(t('no_quotes'))}</p>`}</section>`;
}
const bname = b => (b.name || (getLang() === 'ar' ? stage0(b).ar : stage0(b).en)) + ' #' + (b.n || '');
const stage0 = b => STG.find(s => s.id === b.stageId) || STG[0];
function viewBatch() {
  S.batches = S.batches || []; const tol = S.tol = S.tol || { w: 2, cp: 0.5 };
  const list = S.batches.map((b, idx) => `<tr class="${S.bsel === idx ? 'best' : ''}"><td>${esc(bname(b))}</td><td>${esc(new Date(b.at).toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-GB'))}</td><td class="n">${fx(b.qty, 1)}</td><td><button class="btn sm2" data-act="bopen" data-v="${idx}">${esc(t('open'))}</button> <button class="btn sm2 ghost" data-act="bdel" data-v="${idx}">${esc(t('del'))}</button></td></tr>`).join('');
  let det = '';
  const b = S.batches[S.bsel];
  if (b) {
    let pc = 0, ac = 0, allIn = true, bad = 0; const af = {};
    const rows = ING.filter(i => b.planned[i.id] > 0).map(i => { const p = b.planned[i.id], x = b.actual[i.id]; const has = x != null && x !== ''; if (!has) allIn = false; const v = has ? x - p : null, pct = has ? v / p * 100 : null; const out = has && Math.abs(pct) > tol.w; if (out) bad++; if (has) af[i.id] = x; pc += p * b.price[i.id] / 1000; if (has) ac += x * b.price[i.id] / 1000;
      return `<tr class="${out ? 'z' : ''}"><td>${esc(ingName(i))}</td><td class="n">${fx(p, 1)}</td><td><input class="in sm" data-act="bact" data-id="${i.id}" value="${has ? x : ''}"></td><td class="n">${has ? fx(v, 1) : '-'}</td><td class="n">${has ? fx(pct, 2) + '%' : '-'}${out ? ' <span class="pill bad">' + esc(t('out_tol')) + '</span>' : ''}</td></tr>`; }).join('');
    let aa = ''; if (allIn) { const tt = Object.values(af).reduce((s, y) => s + y, 0); const nf = {}; ING.forEach(i => nf[i.id] = (af[i.id] || 0) / tt * 100); const A = E.analyse(nf, ING, optP()); aa = `<p class="note">${esc(t('actual_an'))}: CP ${fx(A.cp, 2)}% / ME ${fx(A.me, 0)} kcal/kg &nbsp;(${esc(t('planned'))}: CP ${fx(b.a.cp, 2)}% / ME ${fx(b.a.me, 0)})</p>`; }
    const lab = b.lab || {}; const dev = lab.cp !== '' && lab.cp != null ? lab.cp - b.a.cp : null; const labOut = dev != null && Math.abs(dev) > tol.cp;
    det = `<section class="card"><h3>${esc(bname(b))} <small>${fx(b.qty, 1)} MT</small></h3><div class="scroll"><table class="tb sm"><thead><tr><th>${esc(t('ingredient'))}</th><th>${esc(t('planned'))} kg</th><th>${esc(t('actual'))} kg</th><th>${esc(t('variance'))} kg</th><th>%</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">${esc(t('cost_var'))}: ${fx(pc, 0)} → ${allIn ? fx(ac, 0) : '-'} USD ${allIn ? '(' + fx(ac - pc, 0) + ')' : ''} &nbsp; ${bad ? '<span class="pill bad">' + bad + ' ' + esc(t('out_tol')) + '</span>' : ''}</p>${aa}</section>
    <section class="card"><h3>${esc(t('qc_title'))}</h3><p class="note">${esc(t('qc_note'))}</p><div class="bar"><label class="fl">${esc(t('lab_cp'))}<input class="in sm" data-act="blab" data-k="cp" value="${lab.cp != null ? lab.cp : ''}"></label><label class="fl">${esc(t('lab_moist'))}<input class="in sm" data-act="blab" data-k="moist" value="${lab.moist != null ? lab.moist : ''}"></label>
    <div class="kpi"><small>${esc(t('formula_cp'))}</small><b>${fx(b.a.cp, 2)}%</b></div>${dev != null ? `<div class="kpi"><small>${esc(t('dev'))}</small><b>${dev > 0 ? '+' : ''}${fx(dev, 2)}</b></div><span class="pill ${labOut ? 'bad' : 'ok'}">${esc(t(labOut ? 'qc_fail' : 'qc_pass'))}</span>` : ''}</div></section>`;
  }
  return `<section class="card"><h3>${esc(t('batch_title'))}</h3><p class="note">${esc(t('batch_new_note'))}</p><div class="bar"><button class="btn gold" data-act="bnew">${esc(t('batch_new'))}</button><label class="fl">${esc(t('tol_w'))}<input class="in sm" data-act="tol" data-k="w" value="${tol.w}"></label><label class="fl">${esc(t('tol_cp'))}<input class="in sm" data-act="tol" data-k="cp" value="${tol.cp}"></label></div><p class="note warnt">${esc(t('tol_assump'))}</p>${list ? `<table class="tb sm"><thead><tr><th>${esc(t('fname'))}</th><th>${esc(t('date'))}</th><th>MT</th><th></th></tr></thead><tbody>${list}</tbody></table>` : ''}</section>${det}`;
}

function viewAI() {
  const f = S.formula || sampleFormula(), a = analyseCur(f), st = stage(); const k = S.ai || 'status'; const qs = ['status', 'cost', 'opt', 'limits', 'unv'];
  let body = '';
  if (k === 'status') { const bad = compliance(a).filter(c => c.status !== 'ok'); body = bad.length ? `<p>${esc(t('ai_notok'))}</p><ul>${bad.map(c => `<li>${esc(t(c.k === 'capratio' ? 'p_capratio' : 'p_' + c.k))}: ${esc(t(c.status === 'low' ? 'below' : 'above'))} ${fx(c.delta, 3)}</li>`).join('')}</ul>` : `<p>${esc(t('ai_ok'))}</p>`; }
  else if (k === 'cost') { const tot = E.cost(f, ING, prices()); const rows = ING.filter(i => f[i.id] > 0).map(i => ({ i, c: f[i.id] / 100 * S.ing[i.id].price })).sort((x, y) => y.c - x.c).slice(0, 3); body = `<p>${esc(t('ai_cost'))}: ${fx(tot)} ${esc(curLabel())}/MT</p><ul>${rows.map(r => `<li>${esc(ingName(r.i))}: ${fx(r.c)} (${fx(r.c / tot * 100, 1)}%)</li>`).join('')}</ul><p class="note">${esc(t('ai_price_note'))}</p>`; }
  else if (k === 'opt') { const r = runOpt(); if (r.status !== 'optimal') body = `<p>${esc(t('infeasible'))}</p>`; else { const c0 = E.cost(f, ING, prices()); const ch = ING.map(i => ({ i, d: (r.formula[i.id] || 0) - (f[i.id] || 0) })).filter(x => Math.abs(x.d) >= 0.5).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 6); body = `<p>${esc(t('ai_opt'))}: ${fx(c0)} → ${fx(r.cost)} ${esc(curLabel())}/MT (${fx(r.cost - c0)})</p><ul>${ch.map(x => `<li>${esc(ingName(x.i))}: ${x.d > 0 ? '+' : ''}${fx(x.d, 2)} %</li>`).join('')}</ul>`; } }
  else if (k === 'limits') { const bd = bounds(); const hit = ING.filter(i => f[i.id] > 0 && bd[i.id].max > 0 && f[i.id] >= bd[i.id].max - 0.001); body = hit.length ? `<p>${esc(t('ai_limits'))}</p><ul>${hit.map(i => `<li>${esc(ingName(i))}: ${fx(f[i.id], 2)}% = max ${fx(bd[i.id].max, 2)}%</li>`).join('')}</ul><p class="note">${esc(t('ai_limits_note'))}</p>` : `<p>${esc(t('ai_nolimits'))}</p>`; }
  else { const u = ING.filter(i => f[i.id] > 0 && i.status !== 'reference'); body = u.length ? `<p>${esc(t('ai_unv'))}</p><ul>${u.map(i => `<li>${esc(ingName(i))}: ${esc(t('st_' + i.status))}</li>`).join('')}</ul>` : `<p>${esc(t('ai_allref'))}</p>`; }
  return `<section class="card"><h3>${esc(t('ai_title'))}</h3><p class="note">${esc(t('ai_note'))}</p><div class="bar">${qs.map(q => `<button class="btn ${q === k ? 'gold' : ''}" data-act="aiq" data-v="${q}">${esc(t('aiq_' + q))}</button>`).join('')}</div><div class="aibox">${body}</div></section>`;
}

function viewAdd() {
  S.add = S.add || []; const af = S.af = S.af || { name: '', dose: '', cost: '' };
  let dose = 0, cost = 0; const rows = S.add.map((x, idx) => { const c = x.dose * x.cost / 1000 * 1; dose += x.dose; cost += x.dose * x.cost / 1000; return `<tr><td>${esc(x.name)}</td><td class="n">${fx(x.dose, 3)}</td><td class="n">${fx(x.cost)}</td><td class="n">${fx(x.dose * x.cost / 1000)}</td><td><button class="btn sm2 ghost" data-act="adel" data-v="${idx}">${esc(t('del'))}</button></td></tr>`; }).join('');
  const pm = ING.find(i => i.id === 'premix'); const pct = pm ? S.formula ? S.formula.premix || 0.3 : 0.3 : 0.3; const expect = pct * 10;
  const f = (k, lab, w) => `<label class="fl">${esc(t(lab))}<input class="in ${w ? '' : 'sm'}" data-act="af" data-k="${k}" value="${esc(af[k])}"></label>`;
  return `<section class="card"><h3>${esc(t('add_title'))}</h3><p class="note">${esc(t('add_note'))}</p><div class="bar">${f('name', 'add_name', 1)}${f('dose', 'add_dose')}${f('cost', 'add_cost')}<button class="btn gold" data-act="aadd">${esc(t('add_item'))}</button></div>
  ${rows ? `<table class="tb sm"><thead><tr><th>${esc(t('add_name'))}</th><th>${esc(t('add_dose'))}</th><th>${esc(t('add_cost'))}</th><th>${esc(t('add_cpm'))}</th><th></th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td><b>${esc(t('total'))}</b></td><td class="n"><b>${fx(dose, 3)}</b></td><td></td><td class="n"><b>${fx(cost)}</b></td><td></td></tr></tfoot></table>
  <p class="note">${esc(t('add_pct'))}: ${fx(dose / 10, 3)}% &nbsp; ${Math.abs(dose - expect) > 0.001 ? '<span class="pill bad">' + esc(t('add_mismatch')) + ' ' + fx(expect, 2) + ' kg/MT</span>' : ''}</p><div class="bar"><button class="btn" data-act="apm">${esc(t('add_use'))}</button></div>` : ''}<p class="note warnt">${esc(t('add_warn'))}</p></section>`;
}
function viewSrc() {
  const ar = getLang() === 'ar';
  const items = ar ? [
    'قيم المواد الخام: جداول Feedipedia (INRA وCIRAD وAFZ وFAO)، متوسطات عالمية بصفحات مصدرها مذكورة بجانب كل مادة. ليست تحاليل لمادتك أنت: أضف تحليل المعمل عند توفره.',
    'الطاقة: AMEn للدجاج اللاحم بميجاجول/كجم مادة جافة من Feedipedia (أغلبها محسوب بمعادلة حسب Feedipedia) × 239.006 × المادة الجافة. عند غياب قيمة اللاحم استُخدمت قيمة الديك البالغ ووُضّح ذلك في الجدول.',
    'الأحماض الأمينية: نسبة من البروتين من Feedipedia × البروتين الخام للمادة (قيم كلية وليست مهضومة، نفس أساس NRC 1994).',
    'الاحتياجات: NRC 1994 (دواجن) عبر جداول Merck Veterinary Manual وPoultry Hub. ما لم يُتحقق منه موضّح (طاقة وصوديوم البياض).',
    'الفوسفور المتاح: الفوسفور الكلي × 0.35 للمواد النباتية (NRC: الأشكال المهضومة عادة 30 إلى 40% من الكلي) و100% للمنتجات الحيوانية والمعادن. قابل للتعديل.',
    'الحدود القصوى للإضافة وحد الألياف ونسبة الاحتواء الثابتة للبريمكس: افتراضات قابلة للتعديل وليست من NRC.',
    'الأسعار: أرقام مبدئية للتجربة فقط وليست أسعار سوق. أدخل عروض أسعارك الفعلية قبل الاعتماد على أي نتيجة.',
    'المحسّن: برمجة خطية حقيقية (سيمبلكس ثنائي المرحلة) تم التحقق منه مقابل مكتبة SciPy HiGHS على 300 مسألة عشوائية (التطابق كامل). الأسعار الظلية محققة بالفروق المحدودة.',
    'الفيتامينات والإنزيمات والفايتيز والتأثيرات التفاعلية بين المواد غير مُمثّلة بعد. الأحماض الأمينية الصناعية لا تُحسب لها طاقة ولا بروتين.',
    'لا توجد صور في هذه المرحلة. لا يوجد خادم بيانات بعد: الحفظ في متصفحك. يجب مراجعة أي تركيبة نهائية من أخصائي تغذية مؤهل.'
  ] : [
    'Ingredient values: Feedipedia tables (INRA, CIRAD, AFZ, FAO), world averages, with the source page linked per ingredient. They are not assays of YOUR lot: enter lab results when available.',
    'Energy: broiler AMEn in MJ/kg DM from Feedipedia (mostly equation-derived, per Feedipedia) x 239.006 x DM. Where no broiler value exists the cockerel value is used and flagged.',
    'Amino acids: % of protein (Feedipedia) x crude protein of the ingredient. Total (not digestible) amino acids, the same basis as NRC 1994.',
    'Requirements: NRC 1994 poultry via Merck Veterinary Manual and Poultry Hub tables. Anything not re-verified is flagged (layer ME and sodium).',
    'Available P: total P x 0.35 for plant ingredients (NRC: digestible forms are usually 30 to 40% of total), 100% for animal products and mineral sources. Editable.',
    'Maximum inclusion limits, the crude-fibre cap and the fixed 0.3% premix are assumptions, editable, not NRC values.',
    'Prices: placeholders for demonstration, not market prices. Enter your real quotes before relying on any result.',
    'Optimizer: a real linear program (two-phase simplex), checked against SciPy HiGHS on 300 random problems (all objectives match). Shadow prices verified by finite differences.',
    'Vitamins, enzymes, phytase and interaction effects are not modelled yet. Synthetic amino acids get no energy or protein credit.',
    'No photos in this stage. No server yet: data is saved in your browser only. Final formulas must be reviewed by a qualified animal nutritionist.'];
  return `<section class="card"><h3>${esc(t('src_title'))}</h3><ul class="als">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
  <p class="note"><a href="https://www.feedipedia.org" target="_blank" rel="noopener">Feedipedia</a> · <a href="https://www.merckvetmanual.com/multimedia/table/nutrient-requirements-of-broilers" target="_blank" rel="noopener">Merck Vet Manual: Broilers (NRC 1994)</a> · <a href="https://www.poultryhub.org/content/uploads/2012/05/Nutrient-Requirements-of-Broilers-as-Percentages-or-Units-per-Kilogram-of-Diet-90-percent-dry-matter.pdf" target="_blank" rel="noopener">Poultry Hub NRC table</a></p></section>`;
}

/* ---- Actions ---- */
function runOpt(extra) {
  const st = stage(); const ings = enabled();
  const b = bounds();
  const cfg = Object.assign({ ings, bounds: b, req: st.req, prices: prices(), opt: optP(), ratioCaP: st.ratioCaP }, extra || {});
  return E.optimize(cfg);
}
function optimizeNow() {
  ensureFormula();
  const before = E.cost(S.manual || S.formula, ING, prices());
  const r = runOpt();
  if (r.status !== 'optimal') { S.opt = { status: r.status }; return; }
  const f = {}; ING.forEach(i => f[i.id] = r.formula[i.id] || 0);
  S.formula = f; const m0 = compliance(analyseCur(S.manual || f)); S.opt = { status: 'optimal', cost: r.cost, before, binding: r.binding, beforeOk: m0.every(c => c.status === 'ok') };
}
function computeAlts() {
  const defs = [['alt_lowest', {}], ['alt_balanced', { margin: 0.03 }], ['alt_hp', { extra: { cp: 2 } }], ['alt_he', null], ['alt_limited', null], ['alt_local', null]];
  const st = stage(); S.alts = [];
  defs.forEach(([key, ex]) => {
    let r, ing = enabled();
    if (key === 'alt_he') { const req = JSON.parse(JSON.stringify(st.req)); if (req.me) req.me.min *= 1.05; r = E.optimize({ ings: ing, bounds: bounds(), req, prices: prices(), opt: optP(), ratioCaP: st.ratioCaP }); }
    else if (key === 'alt_limited') {
      const base = runOpt(); if (base.status !== 'optimal') r = base; else {
        const order = ing.filter(i => base.formula[i.id] > 1e-6).sort((p, q) => base.formula[q.id] - base.formula[p.id]);
        for (let n = 6; n <= order.length; n++) { const keep = new Set(order.slice(0, n).map(i => i.id)); ING.forEach(i => { if (i.min > 0) keep.add(i.id); });
          const b = bounds(); ing.forEach(i => { if (!keep.has(i.id)) b[i.id] = { min: 0, max: 0 }; });
          r = E.optimize({ ings: ing, bounds: b, req: st.req, prices: prices(), opt: optP(), ratioCaP: st.ratioCaP }); if (r.status === 'optimal') break; }
      }
    } else if (key === 'alt_local') {
      const loc = ing.filter(i => S.ing[i.id].local || ['mineral', 'amino', 'premix'].includes(i.cat));
      if (!ing.some(i => S.ing[i.id].local)) { S.alts.push({ key, note: 'alt_none_local' }); return; }
      r = E.optimize({ ings: loc, bounds: bounds(), req: st.req, prices: prices(), opt: optP(), ratioCaP: st.ratioCaP });
    } else r = runOpt(ex);
    if (r.status !== 'optimal') { S.alts.push({ key, status: r.status }); return; }
    const f = {}; ING.forEach(i => f[i.id] = r.formula[i.id] || 0);
    S.alts.push({ key, status: 'optimal', cost: r.cost, formula: f, a: E.analyse(f, ING, optP()), n: Object.values(f).filter(v => v > 0.0005).length });
  });
}
function scnRun() {
  ensureFormula(); const sc = S.scn; const P = prices(), np = Object.assign({}, P);
  np[sc.id] = sc.mode === 'pct' ? P[sc.id] * (1 + Number(sc.val) / 100) : P[sc.id] + Number(sc.val);
  const prev = E.cost(S.formula, ING, P), stay = E.cost(S.formula, ING, np);
  const st = stage();
  const base = E.optimize({ ings: enabled(), bounds: bounds(), req: st.req, prices: P, opt: optP(), ratioCaP: st.ratioCaP });
  const r = E.optimize({ ings: enabled(), bounds: bounds(), req: st.req, prices: np, opt: optP(), ratioCaP: st.ratioCaP });
  const res = { prev, stay, status: r.status };
  if (r.status === 'optimal') { res.reopt = r.cost; res.changes = ING.map(i => ({ id: i.id, a: base.status === 'optimal' ? (base.formula[i.id] || 0) : (S.formula[i.id] || 0), b: r.formula[i.id] || 0 })).map(c => ({ ...c, d: c.b - c.a })).filter(c => Math.abs(c.d) > 0.01).sort((p, q) => Math.abs(q.d) - Math.abs(p.d)); res.prevOpt = base.cost; }
  sc.res = res; sc.label = ingName(ING.find(i => i.id === sc.id)) + ' ' + (sc.mode === 'pct' ? (sc.val >= 0 ? '+' : '') + sc.val + '%' : (sc.val >= 0 ? '+' : '') + sc.val);
}
function saveCurrent() {
  ensureFormula(); const a = analyseCur(); const comp = compliance(a); const ok = comp.every(c => c.status === 'ok') && Math.abs(a.total - 100) < 0.005;
  const st = stage(); const name = S.name || '';
  const ver = S.saved.filter(s => s.name === name && s.stageId === S.stageId).length + 1;
  S.saved.unshift({ name, version: ver, stageId: S.stageId, stageLabel: { en: st.en, ar: st.ar }, qty: S.qty, currency: S.currency, formula: Object.assign({}, S.formula), prices: prices(), cost: E.cost(S.formula, ING, prices()), a: { cp: a.cp, me: a.me, lys: a.lys, ca: a.ca, avp: a.avp, cf: a.cf }, compliant: ok, status: 'draft', at: Date.now(), by: window.FFI_USER ? window.FFI_USER.email : 'local' });
}
function csvOut() {
  ensureFormula(); const a = analyseCur(); const st = stage(); const f = S.formula;
  const rows = [['Formulation', S.name || st.en], ['Stage', st.en], ['Quantity MT', S.qty], ['Currency', S.currency.toUpperCase()], ['Cost per MT', E.cost(f, ING, prices()).toFixed(2)], [], ['Ingredient', 'Inclusion %', 'kg', 'Price/MT', 'Cost/MT', 'Data status', 'Source']];
  ING.filter(i => f[i.id] > 0.0005).forEach(i => rows.push([i.en, f[i.id].toFixed(3), (f[i.id] / 100 * S.qty * 1000).toFixed(0), S.ing[i.id].price, (f[i.id] / 100 * S.ing[i.id].price).toFixed(2), i.status, i.src]));
  rows.push([], ['Nutrient', 'Required', 'Formulated', 'Status']);
  compliance(a).forEach(c => rows.push([I.en['p_' + c.k], (c.min != null ? '>=' + c.min : '<=' + c.max), c.v == null ? '' : c.v.toFixed(3), c.status]));
  const csv = '\ufeff' + rows.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n');
  const u = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const aEl = document.createElement('a'); aEl.href = u; aEl.download = 'formulation.csv'; aEl.click(); setTimeout(() => URL.revokeObjectURL(u), 2000);
}
function setPrice(id, v) { S.ing[id].price = v; S.priceHist.push({ id, t: Date.now(), price: v }); }
function canWrite() { return !window.FFI_USER || window.FFI_USER.email === ADMIN; }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const a = el.dataset.act, v = el.dataset.v;
  if (a === 'route') S.route = v;
  else if (a === 'lang') { const nl = getLang() === 'ar' ? 'en' : 'ar'; try { localStorage.setItem('suite_lang', nl); } catch (x) { } window.dispatchEvent(new CustomEvent('suite-lang', { detail: nl })); }
  else if (a === 'optimize') optimizeNow();
  else if (a === 'normalize') { ensureFormula(); const tt = Object.values(S.formula).reduce((x, y) => x + y, 0); if (tt > 0) ING.forEach(i => S.formula[i.id] = S.formula[i.id] / tt * 100); S.opt = null; }
  else if (a === 'resetf') { S.formula = sampleFormula(); S.manual = Object.assign({}, S.formula); S.opt = null; }
  else if (a === 'save') { if (!canWrite()) return alert('Read-only'); saveCurrent(); }
  else if (a === 'alts') computeAlts();
  else if (a === 'applyalt') { S.formula = Object.assign({}, S.alts[+v].formula); S.opt = null; }
  else if (a === 'scnrun') scnRun();
  else if (a === 'subrun') runSubst();
  else if (a === 'ld-use') { const lc = S.landed; const v = ['fob', 'freight', 'ins', 'port', 'customs', 'inland', 'other'].reduce((s, k) => s + (Number(lc[k]) || 0), 0); setPrice(lc.id, Math.round(v * 100) / 100); S.market[lc.id] = Object.assign(S.market[lc.id] || {}, { type: 'cif', date: new Date().toISOString().slice(0, 10), note: 'Landed cost calculator' }); }
  else if (a === 'scnsave') { const r = S.scn.res; S.scenarios.unshift({ label: S.scn.label, prev: r.prev, stay: r.stay, reopt: r.reopt != null ? r.reopt : null }); }
  else if (a === 'sload') { const s = S.saved[+v]; S.stageId = s.stageId; S.formula = Object.assign({}, s.formula); S.manual = Object.assign({}, s.formula); S.qty = s.qty; S.currency = s.currency; S.name = s.name; S.route = 'work'; S.opt = null; }
  else if (a === 'sdel') S.saved.splice(+v, 1);
  else if (a === 'qadd') { const q = S.qf, p = parseFloat(String(q.price).replace(',', '.')); if (q.sup && p > 0) { S.quotes.push({ id: q.id, sup: q.sup, price: p, date: q.date, lead: q.lead === '' ? '' : Number(q.lead), moq: q.moq === '' ? '' : Number(q.moq) }); q.sup = ''; q.price = ''; } }
  else if (a === 'qdel') S.quotes.splice(+v, 1);
  else if (a === 'quse') { const q = S.quotes[+v], id = el.dataset.id; setPrice(id, q.price); S.market[id] = Object.assign(S.market[id] || {}, { type: 'offer', date: q.date, note: q.sup }); S.opt = null; }
  else if (a === 'bnew') { ensureFormula(); const f = S.formula, A = analyseCur(f), pl = {}, pr = {}; ING.forEach(i => { if (f[i.id] > 0) { pl[i.id] = Math.round(f[i.id] / 100 * S.qty * 1000 * 10) / 10; pr[i.id] = S.ing[i.id].price; } }); S.batches = S.batches || []; S.batches.unshift({ name: S.name || '', stageId: S.stageId, n: S.batches.length + 1, at: Date.now(), qty: S.qty, planned: pl, actual: {}, price: pr, a: { cp: A.cp, me: A.me }, lab: {} }); S.bsel = 0; }
  else if (a === 'aiq') S.ai = v;
  else if (a === 'aadd') { const q = S.af, d = parseFloat(String(q.dose).replace(',', '.')), c = parseFloat(String(q.cost).replace(',', '.')); if (q.name && d > 0 && c >= 0) { S.add.push({ name: q.name, dose: d, cost: c }); q.name = ''; q.dose = ''; q.cost = ''; } }
  else if (a === 'adel') S.add.splice(+v, 1);
  else if (a === 'apm') { const dose = S.add.reduce((s, x) => s + x.dose, 0), cost = S.add.reduce((s, x) => s + x.dose * x.cost / 1000, 0); if (dose > 0) { setPrice('premix', Math.round(cost / (dose / 1000) * 100) / 100); S.market.premix = Object.assign(S.market.premix || {}, { type: 'contract', date: new Date().toISOString().slice(0, 10), note: 'premix worksheet' }); S.opt = null; } }
  else if (a === 'bopen') S.bsel = +v;
  else if (a === 'bdel') { S.batches.splice(+v, 1); S.bsel = null; }
  else if (a === 'csv') { csvOut(); return; }
  else if (a === 'print') { window.print(); return; }
  persist(); render();
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-act]'); if (!el) return; const a = el.dataset.act, id = el.dataset.id; let v = el.value; const num = parseFloat(String(v).replace(',', '.'));
  ensureFormula();
  if (a === 'stage') { S.stageId = v; S.opt = null; S.alts = null; }
  else if (a === 'qty') S.qty = num > 0 ? num : S.qty;
  else if (a === 'cur') S.currency = v; else if (a === 'basis') S.basis = v; else if (a === 'name') S.name = v;
  else if (a === 'plantp') { if (num > 0 && num <= 1) S.plantP = num; S.opt = null; }
  else if (a === 'req') { const st = stage(); if (!isNaN(num)) st.req[el.dataset.k][el.dataset.b] = num; }
  else if (a === 'en') S.ing[id].enabled = el.checked; else if (a === 'local') S.ing[id].local = el.checked;
  else if (a === 'incl') { if (!isNaN(num) && num >= 0) { S.formula[id] = num; S.opt = null; } }
  else if (a === 'min') { if (!isNaN(num)) S.ing[id].min = num; } else if (a === 'max') { if (!isNaN(num)) S.ing[id].max = num; }
  else if (a === 'price') { if (!isNaN(num) && num >= 0) setPrice(id, num); }
  else if (a === 'add') { if (v) S.ing[v].enabled = true; }
  else if (a === 'conv-c') S.conv.c = v; else if (a === 'conv-v') { if (!isNaN(num)) S.conv.v = num; }
  else if (a === 'ld') { if (!isNaN(num)) S.landed[el.dataset.k] = num; } else if (a === 'ld-id') S.landed.id = v;
  else if (a === 'ptype' || a === 'pdate' || a === 'pnote') { const m = S.market[id] = S.market[id] || {}; m[a === 'ptype' ? 'type' : a === 'pdate' ? 'date' : 'note'] = v; }
  else if (a === 'inv-stock' || a === 'inv-in') { const m = S.inv[id] = S.inv[id] || {}; const k = a === 'inv-stock' ? 'stock' : 'incoming'; m[k] = v === '' ? null : (isNaN(num) ? m[k] : num); }
  else if (a === 'inv-sup') { (S.inv[id] = S.inv[id] || {}).supplier = v; } else if (a === 'inv-wh') { (S.inv[id] = S.inv[id] || {}).wh = v; }
  else if (a === 'useinv') { S.useInv = el.checked; S.opt = null; } else if (a === 'sub-id') { S.sub.id = v; S.sub.res = null; }
  else if (a === 'scn-id') S.scn.id = v; else if (a === 'scn-mode') S.scn.mode = v; else if (a === 'scn-val') { if (!isNaN(num)) S.scn.val = num; }
  else if (a === 'qf') { S.qf[el.dataset.k] = v; }
  else if (a === 'bact') { const b = S.batches[S.bsel]; b.actual[id] = v === '' ? null : (isNaN(num) ? b.actual[id] : num); }
  else if (a === 'blab') { const b = S.batches[S.bsel]; b.lab = b.lab || {}; b.lab[el.dataset.k] = v === '' ? null : (isNaN(num) ? null : num); }
  else if (a === 'tol') { if (!isNaN(num) && num >= 0) S.tol[el.dataset.k] = num; }
  else if (a === 'af') { S.af[el.dataset.k] = v; }
  else if (a === 'sstatus') { const s = S.saved[+el.dataset.v]; if (v === 'approved' && !s.compliant) return; s.status = v; }
  persist(); render();
});
window.addEventListener('storage', e => { if (e.key === 'suite_lang') render(); });
window.addEventListener('suite-lang', () => render());

function render() {
  const lang = getLang(); document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = t('app');
  let body;
  try { body = ({ dash: viewDash, work: viewWork, mat: viewMat, req: viewReq, scn: viewScn, hist: viewHist, src: viewSrc, market: viewMarket, subst: viewSubst, inv: viewInv, sup: viewSup, batch: viewBatch, ai: viewAI, add: viewAdd }[S.route] || viewWork)(); } catch (err) { body = '<pre>' + esc(err.stack) + '</pre>'; console.error(err); }
  const y = window.scrollY; const active = document.activeElement; 
  $('#app').innerHTML = shell(body);
  window.scrollTo(0, y);
  if (window.FFI_AUTH) window.FFI_AUTH.mount($('#gsi'));
}
window.FFI_PERSIST = persist; window.FFI_RENDER = render; window.FFI_STATE = () => S;
render();
})();
