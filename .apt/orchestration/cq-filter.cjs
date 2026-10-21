const fs = require('fs');
const raw = fs.readFileSync(process.argv[2], 'utf8');
const data = JSON.parse(raw.slice(raw.indexOf('{')));
const out = [];
const seen = new Set();
(function walk(o) {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object') {
    const p = o.file || o.path;
    if (o.severity && typeof p === 'string' && /paycenter/i.test(p) && !seen.has(o)) {
      seen.add(o);
      out.push(o);
    }
    Object.values(o).forEach(walk);
  }
})(data);
const count = (s) => out.filter((x) => x.severity === s).length;
console.log(`high=${count('high')} medium=${count('medium')} low=${count('low')}`);
out.filter((x) => x.severity !== 'low').forEach((x) =>
  console.log(x.severity, x.file || x.path, x.line || '', x.rule || x.type || '', x.message || ''));
