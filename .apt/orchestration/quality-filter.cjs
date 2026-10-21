// 用法：node quality-filter.cjs <check_code_quality 输出文件> [路径正则，默认 paycenter]
const fs = require('fs');
let text = fs.readFileSync(process.argv[2], 'utf8');
text = text.slice(text.indexOf('{'));
const report = JSON.parse(text);
const pattern = new RegExp(process.argv[3] || 'paycenter', 'i');
const issues = [];
const walk = (o) => {
  if (Array.isArray(o)) o.forEach(walk);
  else if (o && typeof o === 'object') {
    if (o.severity && (o.file || o.path)) issues.push(o);
    Object.values(o).forEach(walk);
  }
};
walk(report);
const scoped = issues.filter((i) => pattern.test(i.file || i.path));
const count = {};
scoped.forEach((i) => { count[i.severity] = (count[i.severity] || 0) + 1; });
console.log('scoped', scoped.length, JSON.stringify(count));
scoped.filter((i) => i.severity !== 'low').forEach((i) =>
  console.log(i.severity, (i.file || i.path).replace(/.*?backend[\\/]/, 'backend/'), i.line || '', i.rule || '', (i.message || '').slice(0, 120)));
