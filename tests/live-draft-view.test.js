const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLiveDraftView } = require('../draft-core/live-draft-view');

const slots = [
  { id: 'QB', type: 'QB', count: 1, eligiblePositions: ['QB'] },
  { id: 'RB', type: 'RB', count: 2, eligiblePositions: ['RB'] },
  { id: 'WR', type: 'WR', count: 2, eligiblePositions: ['WR'] },
  { id: 'TE', type: 'TE', count: 1, eligiblePositions: ['TE'] },
  { id: 'FLEX', type: 'FLEX', count: 2, eligiblePositions: ['RB','WR','TE'] },
  { id: 'K', type: 'K', count: 1, eligiblePositions: ['K'] },
  { id: 'DST', type: 'DST', count: 1, eligiblePositions: ['DST'] },
  { id: 'BN', type: 'BN', count: 5, eligiblePositions: ['QB','RB','WR','TE','K','DST'], isBench: true }
];

test('builds one dominant position-first recommendation', () => {
  const view = buildLiveDraftView({
    recommendation: {
      playerId: 'P1', playerName: 'Example Receiver', position: 'WR', slotId: 'FLEX:1', score: 101.5,
      explanation: 'WR is the best position now. The tier drops before your next pick.'
    },
    rosterSlots: slots,
    assignments: [],
    openStarterSlots: ['QB','RB:1','RB:2','WR:1','WR:2','TE','FLEX:1','FLEX:2','K','DST'],
    openBenchSlots: ['BN:1','BN:2','BN:3','BN:4','BN:5'],
    recentPicks: [],
    sync: { status: 'live', lastSuccessfulSyncAt: '2026-09-07T20:00:00.000Z' }
  });
  assert.equal(view.headline, 'BEST PICK: WR — Example Receiver');
  assert.equal(view.slotLabel, 'FLEX');
  assert.match(view.reason, /tier drops/i);
  assert.equal(view.actions.they, 'THEY TOOK HIM');
  assert.equal(view.actions.mine, 'I TOOK HIM');
});

test('builds the compact Game of Throws roster strip from actual slots', () => {
  const view = buildLiveDraftView({
    recommendation: null,
    rosterSlots: slots,
    assignments: [
      { playerId:'q1', slotId:'QB', position:'QB' },
      { playerId:'r1', slotId:'RB:1', position:'RB' },
      { playerId:'w1', slotId:'WR:1', position:'WR' },
      { playerId:'w2', slotId:'WR:2', position:'WR' },
      { playerId:'b1', slotId:'BN:1', position:'RB' },
      { playerId:'b2', slotId:'BN:2', position:'TE' }
    ],
    openStarterSlots: ['RB:2','TE','FLEX:1','FLEX:2','K','DST'],
    openBenchSlots: ['BN:3','BN:4','BN:5'],
    recentPicks: [],
    sync: { status:'manual', lastSuccessfulSyncAt:null }
  });
  assert.deepEqual(view.rosterChips, ['QB ✅','RB 1/2','WR ✅','TE 0/1','FLEX 0/2','K 0/1','DEF 0/1','BN 2/5']);
});

test('shows newest recent picks first and marks my pick', () => {
  const view = buildLiveDraftView({
    recommendation: null,
    rosterSlots: slots,
    assignments: [], openStarterSlots: [], openBenchSlots: [],
    myTeamId: 'T1',
    playerNames: { P1:'Alpha', P2:'Bravo' },
    recentPicks: [
      { overall: 1, playerId:'P1', teamId:'T2' },
      { overall: 2, playerId:'P2', teamId:'T1' }
    ],
    sync: { status:'live', lastSuccessfulSyncAt:'2026-09-07T20:00:00.000Z' }
  });
  assert.deepEqual(view.recentPicks, ['#2 Bravo · MINE', '#1 Alpha']);
});

test('surfaces live, stale, disconnected, and manual sync labels', () => {
  const base = { recommendation:null, rosterSlots:slots, assignments:[], openStarterSlots:[], openBenchSlots:[], recentPicks:[] };
  assert.equal(buildLiveDraftView({ ...base, sync:{status:'live'} }).syncLabel, 'LIVE');
  assert.equal(buildLiveDraftView({ ...base, sync:{status:'stale'} }).syncLabel, 'STALE');
  assert.equal(buildLiveDraftView({ ...base, sync:{status:'disconnected'} }).syncLabel, 'DISCONNECTED');
  assert.equal(buildLiveDraftView({ ...base, sync:{status:'manual'} }).syncLabel, 'MANUAL');
});