/* Feed formulation engine: nutrient maths + least-cost LP. All values per kg of as-fed diet. */
(function (root) {
  const NUT = ['me', 'cp', 'cf', 'ee', 'ash', 'ndf', 'ca', 'p', 'avp', 'na', 'cl', 'lys', 'met', 'cys', 'metcys', 'thr', 'trp', 'val'];
  const MJ2KCAL = 239.006;
  // returns as-fed composition. null = value not reported by the source (kept distinct from zero)
  function composition(ing, opt) {
    opt = opt || {};
    const out = {};
    if (ing.direct) {
      const d = ing.direct;
      NUT.forEach(k => out[k] = d[k] !== undefined ? d[k] : (['me', 'cp', 'cf', 'ee', 'ca', 'p', 'avp', 'na', 'lys', 'met', 'thr'].includes(k) ? 0 : null));
      out.dm = 100;
      if (out.met != null && out.cys != null) out.metcys = out.met + out.cys; else out.metcys = out.met;
      return out;
    }
    const f = ing.dm / 100;
    const pct = v => v == null ? null : v * f;
    out.dm = ing.dm;
    out.cp = pct(ing.cp); out.cf = pct(ing.cf); out.ee = pct(ing.ee); out.ash = pct(ing.ash); out.ndf = pct(ing.ndf);
    out.ca = ing.ca == null ? null : ing.ca / 10 * f;
    out.p = ing.p == null ? null : ing.p / 10 * f;
    const frac = opt.plantPFrac != null && ing.pFrac !== 1 ? opt.plantPFrac : ing.pFrac;
    out.avp = out.p == null ? null : out.p * frac;
    out.na = ing.na == null ? null : ing.na / 10 * f;
    out.cl = null;
    out.me = ing.ame == null ? null : ing.ame * MJ2KCAL * f;
    ['lys', 'met', 'cys', 'thr', 'trp', 'val'].forEach(k => out[k] = ing[k] == null || out.cp == null ? null : out.cp * ing[k] / 100);
    out.metcys = out.met != null && out.cys != null ? out.met + out.cys : null;
    return out;
  }
  // nutrient content of a formula {id: kg per 100 kg}
  function analyse(formula, ings, opt) {
    const res = {}; const missing = {};
    NUT.forEach(k => { res[k] = 0; missing[k] = []; });
    let total = 0, dm = 0;
    ings.forEach(ing => {
      const x = formula[ing.id] || 0; if (x <= 0) return;
      total += x;
      const c = composition(ing, opt);
      dm += x * (c.dm || 0) / 100;
      NUT.forEach(k => { if (c[k] == null) { if (!ing.direct && !['cl', 'ndf', 'ash'].includes(k)) missing[k].push(ing.id); } else res[k] += x / 100 * c[k]; });
    });
    res.total = total; res.dm = total ? dm / total * 100 : 0; res.missing = missing;
    res.caP = res.avp > 0 ? res.ca / res.avp : null;
    return res;
  }
  function cost(formula, ings, prices) {
    let s = 0; ings.forEach(i => { s += (formula[i.id] || 0) / 100 * (prices[i.id] != null ? prices[i.id] : i.price); });
    return s; // per MT
  }
  const CONSTRAINT_KEYS = ['me', 'cp', 'lys', 'met', 'metcys', 'thr', 'trp', 'val', 'ca', 'avp', 'na', 'cf', 'ee'];
  /* cfg: {ings (enabled candidates), bounds:{id:{min,max}}, req:{k:{min,max}}, prices, opt, ratioCaP, margin (fraction), extra:{k:delta}} */
  function optimize(cfg) {
    const ings = cfg.ings, n = ings.length;
    const comp = ings.map(i => composition(i, cfg.opt));
    const rows = [], meta = [];
    rows.push({ a: new Array(n).fill(1), t: '=', b: 100 }); meta.push({ kind: 'total' });
    ings.forEach((ing, j) => {
      const b = cfg.bounds[ing.id] || {};
      if (b.max != null && b.max < 100) { const a = new Array(n).fill(0); a[j] = 1; rows.push({ a, t: '<=', b: b.max }); meta.push({ kind: 'max', id: ing.id }); }
      if (b.min > 0) { const a = new Array(n).fill(0); a[j] = 1; rows.push({ a, t: '>=', b: b.min }); meta.push({ kind: 'min', id: ing.id }); }
    });
    const skipped = [];
    Object.keys(cfg.req).forEach(k => {
      const r = cfg.req[k]; if (!r) return;
      // ingredients with unknown value for k are treated as 0 contribution (conservative for minimums); flagged by analyse()
      const a = comp.map(c => c[k] == null ? 0 : c[k]);
      const mult = (cfg.margin && r.min != null && k !== 'cf') ? 1 + cfg.margin : 1;
      const extra = (cfg.extra && cfg.extra[k]) || 0;
      if (r.min != null) { rows.push({ a: a.slice(), t: '>=', b: (r.min * mult + extra) * 100 / 100 * 1 }); meta.push({ kind: 'min-nutrient', k }); }
      if (r.max != null) { rows.push({ a: a.slice(), t: '<=', b: r.max }); meta.push({ kind: 'max-nutrient', k }); }
    });
    // rows above: sum_j x_j * c_jk /100 >= req  ->  scale: sum x_j c_jk >= req*100. fix scaling here
    rows.forEach((r, i) => { const m = meta[i]; if (m.kind === 'min-nutrient' || m.kind === 'max-nutrient') r.b = r.b * 100; });
    if (cfg.ratioCaP) {
      const a = comp.map(c => (c.ca || 0) - cfg.ratioCaP * (c.avp || 0));
      rows.push({ a, t: '<=', b: 0 }); meta.push({ kind: 'ratio' });
    }
    const c = ings.map(i => (cfg.prices[i.id] != null ? cfg.prices[i.id] : i.price) / 100); // cost per MT per kg-of-100
    const sol = solveLP(c, rows);
    if (sol.status !== 'optimal') return { status: sol.status, rows, meta };
    const formula = {}; ings.forEach((i, j) => { formula[i.id] = sol.x[j] < 1e-7 ? 0 : sol.x[j]; });
    const binding = [];
    rows.forEach((r, i) => {
      let lhs = 0; r.a.forEach((v, j) => lhs += v * sol.x[j]);
      const tight = Math.abs(lhs - r.b) < 1e-6 * Math.max(1, Math.abs(r.b));
      const d = sol.duals[i];
      if (meta[i].kind !== 'total' && tight && Math.abs(d) > 1e-9) binding.push({ ...meta[i], dual: (String(meta[i].kind).endsWith('nutrient') ? d * 100 : d), rhs: r.b });
    });
    return { status: 'optimal', formula, cost: sol.obj, binding, duals: sol.duals, meta };
  }
  root.FFI_ENGINE = { NUT, composition, analyse, cost, optimize, CONSTRAINT_KEYS, MJ2KCAL };
})(window);
