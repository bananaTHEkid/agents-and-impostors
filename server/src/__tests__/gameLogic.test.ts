import { initDB, getDB } from '../db/db';
import { assignTeamsAndOperations } from '../game-logic/gameService';
import { GAME_CONFIG, OPERATION_CONFIG } from '../game-logic/config';
import { RoundResult } from '../game-logic/types';

const fakeIo = {
  to: () => ({ emit: jest.fn() })
} as any;

const noopSocketLookup = () => undefined;

describe('game start assignment', () => {
  beforeEach(async () => {
    await initDB(true);
    jest.spyOn(Math, 'random').mockReturnValue(0.25);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([0, 4, 11])('rejects an unsupported player count (%i)', async (count) => {
    await expect(assignTeamsAndOperations(
      'lobby-1',
      Array.from({ length: count }, (_, index) => `p${index}`),
      fakeIo,
      noopSocketLookup
    )).rejects.toThrow('Invalid number of players');
  });

  async function seedLobby(players: string[]) {
    const db = getDB();
    await db.run(
      "INSERT INTO lobbies (id, lobby_code, status, phase, current_round, total_rounds) VALUES (?, ?, 'waiting', 'waiting', 0, 1)",
      ['lobby-1', 'ABC123']
    );
    for (const username of players) {
      await db.run(
        "INSERT INTO players (username, lobby_id, team, eliminated, operation, operation_info, win_status) VALUES (?, ?, '', 0, NULL, NULL, NULL)",
        [username, 'lobby-1']
      );
    }
  }

  it('assigns two impostors and three agents for a five-player game', async () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5'];
    await seedLobby(players);

    const result = await assignTeamsAndOperations('lobby-1', players, fakeIo, noopSocketLookup);
    const rows = await getDB().all('SELECT username, team, operation FROM players ORDER BY username');

    expect(rows.filter((row: any) => row.team === 'impostor')).toHaveLength(2);
    expect(rows.filter((row: any) => row.team === 'agent')).toHaveLength(3);
    expect(rows).toHaveLength(5);
    expect(result.playerOperations).toHaveLength(5);
    expect(rows.every((row: any) => GAME_CONFIG.OPERATIONS.some(operation => operation.name === row.operation))).toBe(true);
    expect(rows.some((row: any) => ['spy transfer', 'sleeper agent', 'defector'].includes(row.operation))).toBe(false);
  });

  it('assigns three impostors and includes two win-condition operations for seven players', async () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    await seedLobby(players);

    await assignTeamsAndOperations('lobby-1', players, fakeIo, noopSocketLookup);
    const rows = await getDB().all('SELECT team, operation FROM players');
    const winOperations = new Set(['grudge', 'infatuation', 'scapegoat', 'sleeper agent', 'defector', 'spy transfer']);

    expect(rows.filter((row: any) => row.team === 'impostor')).toHaveLength(3);
    expect(rows.filter((row: any) => row.team === 'agent')).toHaveLength(4);
    expect(rows.filter((row: any) => winOperations.has(row.operation))).toHaveLength(2);
  });
});

describe('operation rules', () => {
  beforeEach(async () => {
    await initDB(true);
    await getDB().run(
      "INSERT INTO lobbies (id, lobby_code, status, phase) VALUES ('lobby-1', 'ABC123', 'playing', 'voting')"
    );
  });

  async function seedPlayer(username: string, team: string, operation: string, info: object) {
    await getDB().run(
      "INSERT INTO players (username, lobby_id, team, operation, operation_info) VALUES (?, 'lobby-1', ?, ?, ?)",
      [username, team, operation, JSON.stringify(info)]
    );
  }

  it('marks a grudge holder as a winner when the target is eliminated', async () => {
    await seedPlayer('grudge-holder', 'agent', 'grudge', { grudgeTarget: 'target' });
    await seedPlayer('target', 'impostor', 'secret tip', {});

    const round: RoundResult = {
      winner: 'agent',
      eliminatedPlayers: ['target'],
      votes: { voter: 'target' },
      roundNumber: 1
    };
    await OPERATION_CONFIG.grudge.modifyWinCondition!(
      'lobby-1', ['grudge-holder', 'target'], round.votes,
      { 'grudge-holder': 'agent', target: 'impostor' }, getDB(), round
    );

    const row = await getDB().get('SELECT win_status, operation_info FROM players WHERE username = ?', ['grudge-holder']);
    expect(row.win_status).toBe('win');
    expect(JSON.parse(row.operation_info).grudgeTriggered).toBe(true);
  });

  it('reveals both teams for Danish intelligence when both targets are agents', async () => {
    await seedPlayer('investigator', 'agent', 'danish intelligence', { targetPlayer1: 'one', targetPlayer2: 'two' });
    await seedPlayer('one', 'agent', 'secret tip', {});
    await seedPlayer('two', 'agent', 'secret tip', {});

    await OPERATION_CONFIG['danish intelligence'].modifyWinCondition!(
      'lobby-1', ['investigator', 'one', 'two'], {},
      { investigator: 'agent', one: 'agent', two: 'agent' }, getDB()
    );

    const row = await getDB().get('SELECT operation_info FROM players WHERE username = ?', ['investigator']);
    const info = JSON.parse(row.operation_info);
    expect(info.revealed.target1Team).toBe('agent');
    expect(info.revealed.target2Team).toBe('agent');
  });

  it('transfers the spy holder to the selected target team exactly once', async () => {
    await seedPlayer('spy', 'agent', 'spy transfer', { targetPlayer: 'target' });
    await seedPlayer('target', 'impostor', 'secret tip', {});

    const teams = { spy: 'agent', target: 'impostor' };
    await OPERATION_CONFIG['spy transfer'].modifyWinCondition!(
      'lobby-1', ['spy', 'target'], {}, teams, getDB()
    );
    await OPERATION_CONFIG['spy transfer'].modifyWinCondition!(
      'lobby-1', ['spy', 'target'], {}, teams, getDB()
    );

    const row = await getDB().get('SELECT team, operation_info FROM players WHERE username = ?', ['spy']);
    expect(row.team).toBe('impostor');
    expect(JSON.parse(row.operation_info).transferApplied).toBe(true);
  });
});
