const test = require('node:test');
const assert = require('node:assert/strict');
const { createManualDraftProvider } = require('../draft-core/manual-provider');
const { assertDraftStateProvider } = require('../draft-core/provider-contract');

function config() {
  return {
    league: {
      leagueId: 'manual-L1',
      platform: 'manual',
      season: 2026,
      scoring: { pass_td: 4, rush_td: 6, rec: 1 },
      teams: 2,
      draftType: 'snake',
      rosterSlots: [
        { id: 'QB', type: 'QB', count: 1, eligiblePositions: ['QB'] },
        { id: 'FLEX', type: 'FLEX', count: 1, eligiblePositions: ['RB', 'WR', 'TE'] },
        { id: 'BN', type: 'BN', count: 2, eligiblePositions: ['QB', 'RB', 'WR', 'TE', 'K', 'DST'], isBench: true }
      ]
    },
    draftId: 'manual-D1',
    myTeamId: 'T1',
    teams: [{ teamId: 'T1', ownerName: 'Me' }, { teamId: 'T2', ownerName: 'Other' }],
    playerPool: [
      { id: 'P1', position: 'WR' },
      { id: 'P2', position: 'RB' },
      { id: 'P3', position: 'QB' }
    ]
  };
}

test('manual provider satisfies the platform-independent provider boundary', async () => {
  const provider = createManualDraftProvider();
  assert.equal(assertDraftStateProvider(provider), true);
  await provider.connect(config());
  assert.equal((await provider.listLeagues())[0].leagueId, 'manual-L1');
});

test('connect materializes a valid manual DraftState with all players available', async () => {
  const provider = createManualDraftProvider();
  await provider.connect(config());
  const state = await provider.loadDraft('manual-D1');
  assert.equal(state.sync.status, 'manual');
  assert.deepEqual(state.availablePlayerIds, ['P1', 'P2', 'P3']);
  assert.deepEqual(state.draftedPlayerIds, []);
  assert.equal(state.myTeamId, 'T1');
});

test('recordPick removes a player from availability and tracks chronological picks', async () => {
  const provider = createManualDraftProvider();
  await provider.connect(config());
  await provider.recordPick({ playerId: 'P1', teamId: 'T2' });
  await provider.recordPick({ playerId: 'P2', teamId: 'T1' });
  const state = await provider.loadDraft('manual-D1');
  assert.deepEqual(state.draftedPlayerIds, ['P1', 'P2']);
  assert.deepEqual(state.availablePlayerIds, ['P3']);
  assert.equal(state.picks[0].overall, 1);
  assert.equal(state.picks[1].overall, 2);
  assert.equal(state.picks[1].source, 'manual');
});

test('recordPick rejects an already drafted player', async () => {
  const provider = createManualDraftProvider();
  await provider.connect(config());
  await provider.recordPick({ playerId: 'P1', teamId: 'T2' });
  await assert.rejects(() => provider.recordPick({ playerId: 'P1', teamId: 'T1' }), /already drafted/i);
});

test('my picks are exposed for later roster assignment without guessing platform identity', async () => {
  const provider = createManualDraftProvider();
  await provider.connect(config());
  await provider.recordPick({ playerId: 'P2', teamId: 'T1' });
  const state = await provider.loadDraft('manual-D1');
  assert.deepEqual(state.myRoster, [{ playerId: 'P2', slotId: 'UNASSIGNED', position: 'RB' }]);
});

test('undoLastPick restores availability and my roster materialization', async () => {
  const provider = createManualDraftProvider();
  await provider.connect(config());
  await provider.recordPick({ playerId: 'P1', teamId: 'T2' });
  await provider.recordPick({ playerId: 'P2', teamId: 'T1' });
  const removed = await provider.undoLastPick();
  assert.equal(removed.playerId, 'P2');
  const state = await provider.loadDraft('manual-D1');
  assert.deepEqual(state.availablePlayerIds, ['P2', 'P3']);
  assert.deepEqual(state.myRoster, []);
});