/* Linear programming: two-phase dense tableau simplex (Bland's rule fallback).
   minimize c.x  s.t.  rows[i]: a.x (<= | >= | =) b,  x >= 0
   Returns {status:'optimal'|'infeasible'|'unbounded', x, obj, duals[], slack[]}
   duals[i] = shadow price d(obj)/d(b_i) for each constraint row. */
(function (root) {
  function solveLP(c, rows) {
    const n = c.length, m = rows.length, EPS = 1e-9;
    // normalise so b >= 0
    const R = rows.map(r => {
      let a = r.a.slice(), b = r.b, t = r.t, flip = 1;
      if (b < 0) { a = a.map(v => -v); b = -b; flip = -1; t = t === '<=' ? '>=' : t === '>=' ? '<=' : '='; }
      return { a, b, t, flip };
    });
    let nSlack = 0, nArt = 0;
    R.forEach(r => { if (r.t !== '=') nSlack++; if (r.t !== '<=') nArt++; });
    const N = n + nSlack + nArt;
    const T = []; // m rows x (N+1)
    const basis = new Array(m);
    let si = n, ai = n + nSlack;
    const slackCol = new Array(m).fill(-1), slackSign = new Array(m).fill(0);
    const artCols = [];
    R.forEach((r, i) => {
      const row = new Array(N + 1).fill(0);
      for (let j = 0; j < n; j++) row[j] = r.a[j];
      row[N] = r.b;
      if (r.t === '<=') { row[si] = 1; slackCol[i] = si; slackSign[i] = 1; basis[i] = si; si++; }
      else if (r.t === '>=') { row[si] = -1; slackCol[i] = si; slackSign[i] = -1; si++; row[ai] = 1; basis[i] = ai; artCols.push(ai); ai++; }
      else { row[ai] = 1; basis[i] = ai; artCols.push(ai); ai++; }
      T.push(row);
    });
    function run(cost, allowedCols) {
      // cost: length N; build reduced cost row
      const z = new Array(N + 1).fill(0);
      for (let j = 0; j < N; j++) z[j] = cost[j];
      for (let i = 0; i < m; i++) {
        const cb = cost[basis[i]];
        if (cb !== 0) for (let j = 0; j <= N; j++) z[j] -= cb * T[i][j];
      }
      let iter = 0, bland = false;
      while (iter++ < 20000) {
        if (iter > 4000) bland = true;
        let e = -1, best = -EPS;
        for (let j = 0; j < N; j++) {
          if (!allowedCols[j]) continue;
          if (z[j] < best) { best = z[j]; e = j; if (bland) break; }
        }
        if (e < 0) return { z, status: 'optimal' };
        let l = -1, ratio = Infinity;
        for (let i = 0; i < m; i++) {
          if (T[i][e] > EPS) {
            const rr = T[i][N] / T[i][e];
            if (rr < ratio - 1e-12 || (Math.abs(rr - ratio) <= 1e-12 && l >= 0 && basis[i] < basis[l])) { ratio = rr; l = i; }
          }
        }
        if (l < 0) return { z, status: 'unbounded' };
        const p = T[l][e];
        for (let j = 0; j <= N; j++) T[l][j] /= p;
        for (let i = 0; i < m; i++) if (i !== l) {
          const f = T[i][e];
          if (f !== 0) for (let j = 0; j <= N; j++) T[i][j] -= f * T[l][j];
        }
        const f = z[e];
        for (let j = 0; j <= N; j++) z[j] -= f * T[l][j];
        basis[l] = e;
      }
      return { z, status: 'iterlimit' };
    }
    const all = new Array(N).fill(true);
    if (nArt > 0) {
      const c1 = new Array(N).fill(0);
      artCols.forEach(j => c1[j] = 1);
      const r1 = run(c1, all);
      let infeas = 0;
      for (let i = 0; i < m; i++) if (artCols.includes(basis[i])) infeas += T[i][N];
      if (infeas > 1e-7) return { status: 'infeasible', infeasibility: infeas };
      // drive artificials out of basis
      for (let i = 0; i < m; i++) if (artCols.includes(basis[i])) {
        let k = -1;
        for (let j = 0; j < n + nSlack; j++) if (Math.abs(T[i][j]) > 1e-9) { k = j; break; }
        if (k >= 0) {
          const p = T[i][k];
          for (let j = 0; j <= N; j++) T[i][j] /= p;
          for (let r = 0; r < m; r++) if (r !== i) { const f = T[r][k]; if (f !== 0) for (let j = 0; j <= N; j++) T[r][j] -= f * T[i][j]; }
          basis[i] = k;
        }
      }
    }
    const allowed = new Array(N).fill(true);
    artCols.forEach(j => allowed[j] = false);
    const c2 = new Array(N).fill(0);
    for (let j = 0; j < n; j++) c2[j] = c[j];
    const r2 = run(c2, allowed);
    if (r2.status === 'unbounded') return { status: 'unbounded' };
    const x = new Array(n).fill(0);
    for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = T[i][N];
    let obj = 0; for (let j = 0; j < n; j++) obj += c[j] * x[j];
    // duals: for <= row with slack col s: dual = -z[s]; for >= row (slack -1): dual = z[s]; for = row via artificial col
    const duals = new Array(m).fill(0);
    const z = r2.z;
    let ac = n + nSlack;
    R.forEach((r, i) => {
      let d = 0;
      if (r.t === '<=') d = -z[slackCol[i]];
      else if (r.t === '>=') { d = z[slackCol[i]]; ac++; }
      else { d = -z[ac] ; ac++; }
      // artificial reduced cost excluded from allowed cols but z still maintained
      duals[i] = d * r.flip;
    });
    const slack = rows.map(r => { let s = 0; for (let j = 0; j < n; j++) s += r.a[j] * x[j]; return { lhs: s }; });
    return { status: 'optimal', x, obj, duals, slack };
  }
  root.solveLP = solveLP;
  if (typeof module !== 'undefined') module.exports = { solveLP };
})(typeof window !== 'undefined' ? window : globalThis);
