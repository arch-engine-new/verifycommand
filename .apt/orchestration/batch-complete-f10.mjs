// Simplified: only imports that actually exist
import { OrchestrationDb } from 'file:///C:/Users/weilt/.apt/mcp-server/dist/orchestration/db.js';
import { batchSummary } from 'file:///C:/Users/weilt/.apt/mcp-server/dist/orchestration/ledger.js';
import { batchCompleteSlice } from 'file:///C:/Users/weilt/.apt/mcp-server/dist/orchestration/slices.js';
import { batchLockAcquire, batchLockRelease } from 'file:///C:/Users/weilt/.apt/mcp-server/dist/orchestration/lock.js';

const projectRoot = process.argv[2] || process.cwd();
const db = OrchestrationDb.open(projectRoot);

// 1. before
const before = await batchSummary(db);
console.log('BEFORE queueByStatus:', JSON.stringify(before.data?.queue?.byStatus), 'slicesByStatus:', JSON.stringify(before.data?.slices?.byStatus), 'lockHeld:', before.data?.executor?.lockHeld, 'terminal:', before.data?.executor?.batchTerminal);

// 2. acquire lock if not held
let lock = db.getCurrentLock();
if (!lock) {
  const aq = await batchLockAcquire(db, { holder: 'trae-continue-f10', baseBranch: 'master' });
  console.log('lock acquire:', aq.ok, aq.errors);
  lock = db.getCurrentLock();
}
console.log('lock:', lock ? `${lock.kind} epoch=${lock.epoch}` : 'null');

// 3. complete F-10
const complete = await batchCompleteSlice(db, { sliceId: 'F-10', status: 'done', note: 'S5 后端面全链：546测绿+E2E7+playbook-gate exit 0，7af79de' });
console.log('batchCompleteSlice ok:', complete.ok, 'hints:', complete.hints);

// 4. release (always, we're loopDone)
const rel = await batchLockRelease(db, { confirmStale: true });
console.log('lockRelease ok:', rel.ok, (rel.actions || []).join('; '));

// 5. after
const after = await batchSummary(db);
console.log('AFTER queueByStatus:', JSON.stringify(after.data?.queue?.byStatus), 'slicesByStatus:', JSON.stringify(after.data?.slices?.byStatus), 'lockHeld:', after.data?.executor?.lockHeld, 'terminal:', after.data?.executor?.batchTerminal, 'doneUnarchived:', after.data?.executor?.doneUnarchived);

db.close();
console.log('DONE');
