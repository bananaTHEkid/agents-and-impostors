import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { getDB } from './db/db';
import { GamePhase } from './game-logic/types';
import { GAME_CONFIG, OPERATION_CONFIG } from './game-logic/config';
import * as gameService from './game-logic/gameService';
import * as lobbyService from './lobby-manager/lobbyService';
import * as connectionManager from './connectionManager';
import {
  validateUsername,
  validateLobbyCode,
  validateOperationNotUsed,
  validateVoteData,
  sanitizeOperation
} from './utils/validators';

let io: Server | null = null;
const playerOperationsByLobby: { [lobbyId: string]: any[] } = {};
// In-memory turn state per lobby. Persisting in DB is optional and can be added later.
const turnStateByLobby: { [lobbyId: string]: { order: string[]; turnIndex: number } } = {};

function advanceTurn(lobbyId: string) {
  const state = turnStateByLobby[lobbyId];
  if (!state || !state.order || state.order.length === 0) return;
  state.turnIndex = (state.turnIndex + 1) % state.order.length;
  const next = state.order[state.turnIndex];
  io?.to(lobbyId).emit('turn-change', { currentTurnPlayer: next, turnIndex: state.turnIndex });
}

export function getIO() {
  return io;
}

export function setupSocket(server: ReturnType<typeof createServer>) {
  const defaultOrigins = process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(',').map(s => s.trim())
    : [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://localhost:5000'
      ];

  io = new Server(server, {
    cors: {
      origin: defaultOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log('New client connected:', socket.id);

    socket.on('rejoin-game', async ({ lobbyCode, username, accessToken }) => {
      try {
        const db = getDB();
        const lobby = await db.get('SELECT id, phase, status, current_round, total_rounds FROM lobbies WHERE lobby_code = ?', [lobbyCode]);
        if (!lobby) {
          socket.emit('error', { message: 'Lobby not found' });
          return;
        }
        if (lobby.phase === 'waiting' || lobby.status === 'waiting') {
          socket.emit('error', { message: "Cannot rejoin: Game has not started yet. Please use 'join-lobby' to join the lobby." });
          return;
        }

        const player = await db.get('SELECT id, team, operation, operation_info FROM players WHERE username = ? AND lobby_id = ?', [username, lobby.id]);
        if (!player) {
          socket.emit('error', { message: 'You are no longer in this game. Cannot rejoin.' });
          return;
        }

        if (accessToken) {
          // optional verification left to existing auth utilities if used elsewhere
        }

        connectionManager.cleanupOldSocket(username, socket.id, io as Server);

        const players = await db.all('SELECT username, team, operation, eliminated FROM players WHERE lobby_id = ?', [lobby.id]);

        connectionManager.addConnection(socket.id, username, lobbyCode);
        socket.join(lobby.id);

        await gameService.saveConnectionSession(socket.id, username, lobby.id, lobbyCode);

        socket.emit('game-state', {
          phase: lobby.phase,
          currentState: lobby.status,
          round: lobby.current_round,
          totalRounds: lobby.total_rounds
        });

        socket.emit('player-list', { players });

        if (player.team) {
          const impostors = players.filter((p: any) => p.team === 'impostor').map((p: any) => p.username);
          const agents = players.filter((p: any) => p.team === 'agent').map((p: any) => p.username);
          socket.emit('team-assignment', { impostors, agents, phase: lobby.phase });
          socket.emit('your-team', { team: player.team, message: `You are a ${player.team === 'impostor' ? 'virus agent' : 'service agent'}!` });
        }

        if (player.operation) {
          socket.emit('operation-assigned', { operation: player.operation });
          if (player.operation_info) {
            try {
              let operationInfo = JSON.parse(player.operation_info);
              // For client-choice operations, remove any pre-filled targets and revelations before sending to client
              // but preserve availablePlayers for the UI
              if (player.operation === 'danish intelligence' || player.operation === 'confession' || player.operation === 'defector') {
                // These operations require client input, so remove any server-pre-filled data
                delete operationInfo.targetPlayer;
                delete operationInfo.targetPlayer1;
                delete operationInfo.targetPlayer2;
                delete operationInfo.revealed;
              }
              socket.emit('operation-prepared', { operation: player.operation, info: operationInfo });
            } catch (parseError) {
              console.error(`Error parsing operation_info for ${username}:`, parseError);
            }
          }
        }

        socket.emit('phase-change', { phase: lobby.phase, message: `Current phase: ${lobby.phase}` });

        // If we have in-memory turn state for this lobby, inform the reconnecting client
        try {
          const state = turnStateByLobby[lobby.id];
          if (state) {
            socket.emit('turn-start', { currentTurnPlayer: state.order[state.turnIndex], turnIndex: state.turnIndex });
          }
        } catch (err) {
          /* ignore */
        }

        io?.to(lobby.id).emit('game-message', { type: 'system', text: `${username} has reconnected` });

        console.log(`Player ${username} rejoined game in lobby ${lobbyCode}`);
      } catch (error) {
        console.error('Error in rejoin-game:', error);
        socket.emit('error', { message: 'Failed to rejoin game' });
      }
    });

    socket.on('join-lobby', async (data: { username: string; lobbyCode: string }, callback?: (response: any) => void) => {
      try {
        const { username, lobbyCode } = data;
        if (!validateUsername(username)) {
          if (callback) callback({ success: false, error: 'Invalid username. Must be 2-20 characters, alphanumeric and underscores only.' });
          return;
        }
        if (!validateLobbyCode(lobbyCode)) {
          if (callback) callback({ success: false, error: 'Invalid lobby code format. Must be 6 alphanumeric characters.' });
          return;
        }
        const normalizedLobbyCode = lobbyCode.trim().toUpperCase();

        connectionManager.cleanupOldSocket(username, socket.id, io as Server);

        const lobby = await lobbyService.getLobby(normalizedLobbyCode);
        if (!lobby) {
          if (callback) callback({ success: false, error: 'Lobby does not exist' });
          return;
        }

        const lobbyId = lobby.id;

        const db = getDB();
        const existingPlayer = await db.get('SELECT username FROM players WHERE username = ? AND lobby_id = ?', [username, lobbyId]);

        let players;
        let isNewJoin = false;

        if (existingPlayer) {
          const playersResult = await lobbyService.getLobbyPlayers(normalizedLobbyCode);
          players = playersResult.players || [];
        } else {
          const joinResult = await lobbyService.joinLobby(normalizedLobbyCode, username);
          if (!joinResult.success || !joinResult.lobbyId) {
            if (callback) callback({ success: false, error: joinResult.error });
            return;
          }
          players = joinResult.players || [];
          isNewJoin = true;
        }

        connectionManager.addConnection(socket.id, username, normalizedLobbyCode);
        socket.join(lobbyId);

        await gameService.saveConnectionSession(socket.id, username, lobbyId, normalizedLobbyCode);

        if (isNewJoin) {
          io?.to(lobbyId).emit('player-joined', { username, lobbyId });
        }

        io?.to(lobbyId).emit('player-list', { players });
        socket.emit('player-list', { players });

        if (lobby) {
          io?.to(lobbyId).emit('lobby-state', {
            lobbyId: lobby.id,
            lobbyCode: lobby.lobbyCode || normalizedLobbyCode,
            status: lobby.status,
            currentRound: lobby.current_round,
            totalRounds: lobby.total_rounds,
            players: players,
            updatedAt: new Date().toISOString()
          });
        }

        if (callback) {
          callback({ success: true, lobbyCode: normalizedLobbyCode, players });
        }

        console.log(`Player ${username} ${isNewJoin ? 'joined' : 'reconnected to'} lobby ${normalizedLobbyCode}`);
      } catch (error) {
        console.error('Error joining lobby:', error);
        if (callback) callback({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    socket.on('start-game', async ({ lobbyCode }) => {
      try {
        const db = getDB();
        const lobby = await lobbyService.getLobby(lobbyCode);
        if (!lobby) throw new Error('Lobby does not exist');
        const lobbyId = lobby.id;
        if (lobby.status !== 'waiting') throw new Error('Game has already started');

        const playersInLobby = await db.all('SELECT username FROM players WHERE lobby_id = ?', [lobbyId]);
        if (playersInLobby.length < GAME_CONFIG.MIN_PLAYERS) {
          throw new Error(`Not enough players. Minimum required: ${GAME_CONFIG.MIN_PLAYERS}`);
        }

        await db.run(`UPDATE lobbies SET total_rounds = ?, current_round = 1, status = 'playing', phase = ? WHERE id = ?`, [1, GamePhase.TEAM_ASSIGNMENT, lobbyId]);

        await gameService.startNewRound(lobbyId, 1, {});

        io?.to(lobbyId).emit('game-started', { message: 'Game has started!', players: playersInLobby.map((p: any) => p.username), phase: GamePhase.TEAM_ASSIGNMENT });

        const allPlayers = await db.all('SELECT username, team FROM players WHERE lobby_id = ?', [lobbyId]);
        for (const player of allPlayers) {
          const playerSocketId = connectionManager.getSocketId(player.username);
          if (playerSocketId) {
            io?.to(playerSocketId).emit('your-team', { team: player.team, message: `You are a ${player.team === 'impostor' ? 'virus agent' : 'service agent'}!` });
          }
        }

        const assignResult = await gameService.assignTeamsAndOperations(lobbyId, playersInLobby.map((p: any) => p.username), io as Server, connectionManager.getSocketId);
        const playerOperations = assignResult.playerOperations;
        playerOperationsByLobby[lobbyId] = playerOperations;
        // Initialize turn order (username-based) and notify clients
        try {
          const order = playersInLobby.map((p: any) => p.username);
          if (order.length > 0) {
            turnStateByLobby[lobbyId] = { order, turnIndex: 0 };
            io?.to(lobbyId).emit('turn-start', { currentTurnPlayer: order[0], turnIndex: 0 });
          }
        } catch (err) {
          console.error('Failed to initialize turn order:', err);
        }

        await db.run('UPDATE lobbies SET phase = ? WHERE id = ?', [GamePhase.OPERATION_ASSIGNMENT, lobbyId]);
        io?.to(lobbyId).emit('phase-change', { phase: GamePhase.OPERATION_ASSIGNMENT, message: 'Operation assignment phase has begun.' });
        console.log(`Lobby ${lobbyCode} (id: ${lobbyId}) moved to OPERATION_ASSIGNMENT phase`);

        for (const opItem of playerOperations) {
          const player = opItem.player;
          const operationMeta = opItem.operation;
          const assignedRow = await db.get('SELECT operation_assigned FROM players WHERE lobby_id = ? AND username = ?', [lobbyId, player]);
          if (assignedRow && assignedRow.operation_assigned) continue;

          const playerSocketId = connectionManager.getSocketId(player);
          io?.to(lobbyId).emit('operation-assigned-public', { player, operation: operationMeta?.hidden ? 'hidden operation' : operationMeta?.name });

          if (playerSocketId) {
            io?.to(playerSocketId).emit('operation-assigned', { operation: operationMeta?.name });
            await db.run('UPDATE players SET operation_assigned = 1 WHERE lobby_id = ? AND username = ?', [lobbyId, player]);
            break;
          } else {
            await db.run('UPDATE players SET operation_assigned = 1, operation_accepted = 1 WHERE lobby_id = ? AND username = ?', [lobbyId, player]);
            continue;
          }
        }
      } catch (error) {
        socket.emit('error', { message: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    socket.on('accept-assignment', async ({ lobbyCode, username }) => {
      try {
        const db = getDB();
        const lobby = await lobbyService.getLobby(lobbyCode);
        if (!lobby || !lobby.id) {
          socket.emit('error', { message: 'Lobby not found' });
          return;
        }
        const lobbyId = lobby.id;

        console.log(`Received accept-assignment from ${username} for lobby ${lobbyCode} (id: ${lobbyId})`);
        io?.to(lobbyId).emit('game-message', { type: 'system', text: `${username} accepted their assignment.` });

        // Ensure player has submitted any required operation inputs before accepting
        const playerRow = await db.get('SELECT operation, operation_info FROM players WHERE lobby_id = ? AND username = ?', [lobbyId, username]);
        const playerOpName = playerRow?.operation;
        const playerOpInfoRaw = playerRow?.operation_info;

        // If operation has required fields, validate that operation_info contains them
        if (playerOpName) {
          try {
            const opConfig = OPERATION_CONFIG[playerOpName];
            const requiredFields: string[] = opConfig?.fields || [];
            if (requiredFields.length > 0) {
              let opInfo = {};
              if (playerOpInfoRaw) {
                try { opInfo = JSON.parse(playerOpInfoRaw); } catch (e) { opInfo = {}; }
              }
              const missing = requiredFields.filter(f => !(f in opInfo));
              if (missing.length > 0) {
                socket.emit('game-error', { message: `Cannot accept assignment: required operation inputs missing: ${missing.join(', ')}` });
                return;
              }
            }
          } catch (e) {
            // If we cannot validate op config for any reason, allow accept to avoid blocking players
            console.warn('Could not validate operation fields for', playerOpName, e);
          }
        }

        await db.run('UPDATE players SET operation_accepted = 1 WHERE lobby_id = ? AND username = ?', [lobbyId, username]);

        // If this player has 'secret intel', compute and reveal immediately to them
        try {
          if (playerOpName && typeof playerOpName === 'string' && playerOpName.toLowerCase() === 'secret intel') {
            let opInfo: any = {};
            if (playerOpInfoRaw) {
              try { opInfo = JSON.parse(playerOpInfoRaw); } catch { opInfo = {}; }
            }
            const t1 = opInfo?.targetPlayer1;
            const t2 = opInfo?.targetPlayer2;
            if (t1 && t2) {
              const target1 = await db.get(
                "SELECT team FROM players WHERE lobby_id = ? AND username = ?",
                [lobbyId, t1]
              );
              const target2 = await db.get(
                "SELECT team FROM players WHERE lobby_id = ? AND username = ?",
                [lobbyId, t2]
              );
              if (target1 && target2) {
                const oneOrMoreImpostors = target1.team === 'impostor' || target2.team === 'impostor';
                const bothAgents = target1.team === 'agent' && target2.team === 'agent';
                // Only disclose a summary, never per-player team details
                const message = oneOrMoreImpostors
                  ? 'One or more of these players are impostors.'
                  : (bothAgents ? 'The players are agents.' : 'Intelligence is inconclusive.');

                await db.run(
                  "UPDATE players SET operation_info = json_patch(COALESCE(operation_info, '{}'), ?) WHERE lobby_id = ? AND username = ?",
                  [JSON.stringify({ revealed: { message } }), lobbyId, username]
                );

                // Notify only the accepting player
                socket.emit('operation-info', { operation: 'secret intel', info: { revealed: { message } }, message });
              }
            }
          }
        } catch (intelErr) {
          console.error('Error revealing secret intel on accept:', intelErr);
        }

        // Use turn order to find the next unassigned player (starting after current player)
        const turnState = turnStateByLobby[lobbyId];
        if (!turnState) {
          console.error('No turn state for lobby', lobbyId);
          return;
        }

        // Find current player's index in turn order
        const currentIdx = turnState.order.indexOf(username);
        if (currentIdx === -1) {
          console.error(`Player ${username} not found in turn order for lobby ${lobbyId}`);
          return;
        }

        // Look for next unassigned player in order
        let nextPlayer: string | null = null;
        for (let i = currentIdx + 1; i < turnState.order.length; i++) {
          const candidate = turnState.order[i];
          const candidateRow = await db.get('SELECT operation_assigned FROM players WHERE lobby_id = ? AND username = ?', [lobbyId, candidate]);
          if (candidateRow && !candidateRow.operation_assigned) {
            nextPlayer = candidate;
            break;
          }
        }

        if (nextPlayer) {
          // Find the operation for this player from playerOperationsByLobby
          const playerOps = playerOperationsByLobby[lobbyId] || [];
          const nextOpMeta = playerOps.find(op => op.player === nextPlayer)?.operation;

          const playerSocketId = connectionManager.getSocketId(nextPlayer);

          console.log(`Assigning operation '${nextOpMeta?.name}' to player ${nextPlayer} in lobby ${lobbyCode}`);
          io?.to(lobbyId).emit('operation-assigned-public', { player: nextPlayer, operation: nextOpMeta?.hidden ? 'hidden operation' : nextOpMeta?.name });

          if (playerSocketId) {
            io?.to(playerSocketId).emit('operation-assigned', { operation: nextOpMeta?.name });
            await db.run('UPDATE players SET operation_assigned = 1 WHERE lobby_id = ? AND username = ?', [lobbyId, nextPlayer]);
            console.log(`Sent operation-assigned to ${nextPlayer} (socket ${playerSocketId})`);
            // Advance turn to this newly-assigned player
            advanceTurn(lobbyId);
          } else {
            await db.run('UPDATE players SET operation_assigned = 1, operation_accepted = 1 WHERE lobby_id = ? AND username = ?', [lobbyId, nextPlayer]);
            console.log(`Auto-accepted assignment for offline player ${nextPlayer} in lobby ${lobbyCode}`);
            // Continue to check for more players after this one
          }
        } else {
          // No more unassigned players -> move to voting
          await db.run('UPDATE lobbies SET phase = ? WHERE id = ?', [GamePhase.VOTING, lobbyId]);
          io?.to(lobbyId).emit('phase-change', { phase: GamePhase.VOTING, message: 'All assignments complete. Voting phase begins!' });
          console.log(`All assignments complete for lobby ${lobbyCode} (id: ${lobbyId}). Moved to VOTING phase.`);
        }
      } catch (err) {
        console.error('Error in accept-assignment:', err);
      }
    });

    socket.on('use-confession', async (data: any) => {
      try {
        // Accept both legacy shape ({ targetPlayer, lobbyId }) and generic shape
        // from OperationPanel ({ lobbyCode, operation, payload: { targetPlayer } })
        const rawTarget: string | undefined = data?.targetPlayer ?? data?.payload?.targetPlayer;
        const lobbyCode: string | undefined = data?.lobbyCode;
        let lobbyId: string | undefined = data?.lobbyId;

        if (!lobbyId && lobbyCode) {
          const lobby = await lobbyService.getLobby(lobbyCode);
          lobbyId = lobby?.id;
        }

        const targetPlayer = rawTarget as string | undefined;
        if (!lobbyId) {
          socket.emit('error', { message: 'Lobby not found for confession' });
          return;
        }
        if (!targetPlayer) {
          socket.emit('error', { message: 'Invalid confession target' });
          return;
        }

        const db = getDB();
        // Ensure it's the emitter's turn
        const emitter = connectionManager.getUsername(socket.id) || socket.handshake.auth?.username;
        const turnState = turnStateByLobby[lobbyId];
        if (turnState && turnState.order[turnState.turnIndex] !== emitter) {
          socket.emit('not-your-turn', { message: 'It is not your turn to perform this operation.' });
          socket.emit('game-error', { message: 'It is not your turn to perform this operation.' });
          return;
        }
        if (!validateVoteData(emitter || '', targetPlayer)) {
          socket.emit('error', { message: 'Invalid confession target' });
          return;
        }

        const confessor = await db.get("SELECT username, team FROM players WHERE lobby_id = ? AND operation = 'confession'", [lobbyId]);
        if (!confessor) {
          socket.emit('error', { message: 'Invalid confession operation' });
          return;
        }

        const confessionUsed = await db.get("SELECT operation_accepted FROM players WHERE lobby_id = ? AND operation = 'confession'", [lobbyId]);
        if (confessionUsed && !validateOperationNotUsed(confessionUsed.operation_accepted)) {
          socket.emit('error', { message: 'Confession operation has already been used' });
          return;
        }

        const confessionInfo = sanitizeOperation({ type: 'received_confession', fromPlayer: confessor.username, theirTeam: confessor.team });

        await db.run(
          "UPDATE players SET operation_info = json_patch(COALESCE(operation_info, '{}'), ?) WHERE lobby_id = ? AND username = ?",
          [JSON.stringify(confessionInfo), lobbyId, targetPlayer]
        );

        await db.run(
          "UPDATE players SET operation_info = json_patch(COALESCE(operation_info, '{}'), ?) WHERE lobby_id = ? AND username = ?",
          [JSON.stringify({ confessionMade: true, targetPlayer }), lobbyId, confessor.username]
        );

        const targetSocketId = connectionManager.getSocketId(targetPlayer);
        if (targetSocketId) {
          io?.to(targetSocketId).emit('confession-received', confessionInfo);
        } else {
          console.warn(`Target player ${targetPlayer} not connected`);
        }

        socket.emit('operation-used', { success: true });
        socket.emit('game-message', { type: 'system', text: `${confessor.username} used ${'confession'}` });
        // Advance turn after successful operation
        try { advanceTurn(lobbyId); } catch (e) { /* ignore */ }
      } catch (error) {
        console.error('Error processing confession:', error);
        socket.emit('error', { message: 'Failed to process confession' });
      }
    });

    socket.on('use-defector', async (data: any) => {
      try {
        // Accept both legacy shape ({ targetPlayer, lobbyId }) and generic shape
        // from OperationPanel ({ lobbyCode, operation, payload: { targetPlayer } })
        const rawTarget: string | undefined = data?.targetPlayer ?? data?.payload?.targetPlayer;
        const lobbyCode: string | undefined = data?.lobbyCode;
        let lobbyId: string | undefined = data?.lobbyId;

        if (!lobbyId && lobbyCode) {
          const lobby = await lobbyService.getLobby(lobbyCode);
          lobbyId = lobby?.id;
        }

        const targetPlayer = rawTarget as string | undefined;
        if (!lobbyId) {
          socket.emit('error', { message: 'Lobby not found for defector' });
          return;
        }
        if (!targetPlayer) {
          socket.emit('error', { message: 'No target selected for defector' });
          return;
        }
        const db = getDB();
        // Ensure it's the emitter's turn
        const emitter = connectionManager.getUsername(socket.id) || socket.handshake.auth?.username;
        const turnState = turnStateByLobby[lobbyId];
        if (turnState && turnState.order[turnState.turnIndex] !== emitter) {
          socket.emit('not-your-turn', { message: 'It is not your turn to perform this operation.' });
          socket.emit('game-error', { message: 'It is not your turn to perform this operation.' });
          return;
        }
        if (!validateVoteData(emitter || '', targetPlayer)) {
          socket.emit('error', { message: 'Invalid defector target' });
          return;
        }

        const defector = await db.get("SELECT username, operation_accepted FROM players WHERE lobby_id = ? AND operation = 'defector'", [lobbyId]);
        if (!defector) {
          socket.emit('error', { message: 'Invalid defector operation' });
          return;
        }
        if (defector.operation_accepted && !validateOperationNotUsed(defector.operation_accepted)) {
          socket.emit('error', { message: 'Defector operation has already been used' });
          return;
        }

        const targetExists = await db.get('SELECT username FROM players WHERE lobby_id = ? AND username = ?', [lobbyId, targetPlayer]);
        if (!targetExists) {
          socket.emit('error', { message: 'Target player not found' });
          return;
        }

        await db.run(
          "UPDATE players SET operation_info = json_patch(COALESCE(operation_info, '{}'), ?) WHERE lobby_id = ? AND username = ?",
          [JSON.stringify({ targetPlayer, teamChanged: false }), lobbyId, defector.username]
        );

        socket.emit('operation-used', { success: true, message: `You've chosen ${targetPlayer} as your target. Their team will be switched during the next phase.` });
        socket.emit('game-message', { type: 'system', text: `${defector.username} used ${'defector'}` });
        // Advance turn after successful operation
        try { advanceTurn(lobbyId); } catch (e) { /* ignore */ }
      } catch (error) {
        console.error('Error processing defector operation:', error);
        socket.emit('error', { message: 'Failed to process defector operation' });
      }
    });

    // Generic operation handler for operations that use eventName 'operation-used'
    socket.on('operation-used', async ({ lobbyCode, operation, payload }) => {
      try {
        const db = getDB();
        const lobby = await lobbyService.getLobby(lobbyCode);
        if (!lobby || !lobby.id) {
          socket.emit('error', { message: 'Lobby not found for operation' });
          return;
        }
        const lobbyId = lobby.id;

        const emitter = connectionManager.getUsername(socket.id) || socket.handshake.auth?.username;
        const turnState = turnStateByLobby[lobbyId];
        if (turnState && turnState.order[turnState.turnIndex] !== emitter) {
          socket.emit('not-your-turn', { message: 'It is not your turn to perform this operation.' });
          socket.emit('game-error', { message: 'It is not your turn to perform this operation.' });
          return;
        }

        // Sanitize and persist operation info to the player's row
        const sanitized = sanitizeOperation({ operation, payload });
        await db.run(
          "UPDATE players SET operation_info = json_patch(COALESCE(operation_info, '{}'), ?) WHERE lobby_id = ? AND username = ?",
          [JSON.stringify(sanitized), lobbyId, emitter]
        );

        // For 'danish intelligence', compute and reveal intel immediately to the emitter
        if (typeof operation === 'string' && operation.toLowerCase() === 'danish intelligence') {
          try {
            const t1 = payload?.targetPlayer1;
            const t2 = payload?.targetPlayer2;
            if (t1 && t2) {
              const target1 = await db.get(
                "SELECT team FROM players WHERE lobby_id = ? AND username = ?",
                [lobbyId, t1]
              );
              const target2 = await db.get(
                "SELECT team FROM players WHERE lobby_id = ? AND username = ?",
                [lobbyId, t2]
              );
              if (target1 && target2) {
                const oneOrBothImpostors = target1.team === 'impostor' || target2.team === 'impostor';
                const bothAgents = target1.team === 'agent' && target2.team === 'agent';
                const shouldReveal = oneOrBothImpostors || bothAgents;

                let reveal: any;
                if (shouldReveal) {
                  const message = oneOrBothImpostors
                    ? `Out of ${t1} and ${t2}, one or more of them are impostors.`
                    : `${t1} and ${t2} are both agents.`;
                  reveal = {
                    target1Name: t1,
                    target1Team: target1.team,
                    target2Name: t2,
                    target2Team: target2.team,
                    message
                  };
                } else {
                  reveal = { message: 'One is an impostor and one is an agent (no revelation)' };
                }

                // Persist reveal into operation_info
                await db.run(
                  "UPDATE players SET operation_info = json_patch(COALESCE(operation_info, '{}'), ?) WHERE lobby_id = ? AND username = ?",
                  [JSON.stringify({ revealed: reveal }), lobbyId, emitter]
                );

                // Notify emitter only with structured info
                socket.emit('operation-info', { operation, info: { revealed: reveal }, message: reveal.message });
              }
            }
          } catch (intelErr) {
            console.error('Error generating immediate intel reveal:', intelErr);
          }
        }

        socket.emit('operation-used', { success: true, message: 'Operation submitted.' });
        io?.to(lobbyId).emit('game-message', { type: 'system', text: `${emitter} used operation ${operation}` });

        // Advance turn after operation
        try { advanceTurn(lobbyId); } catch (e) { /* ignore */ }
      } catch (err) {
        console.error('Error handling generic operation-used:', err);
        socket.emit('error', { message: 'Failed to process operation' });
      }
    });

    socket.on('submit-vote', async ({ lobbyCode, username, vote }) => {
      try {
        if (!validateLobbyCode(lobbyCode)) {
          socket.emit('error', { message: 'Invalid lobby code format' });
          return;
        }
        if (!validateVoteData(username, vote)) {
          socket.emit('error', { message: 'Invalid vote: voter and target must be different valid players' });
          return;
        }

        const db = getDB();
        const lobby = await lobbyService.getLobby(lobbyCode);
        if (!lobby || !lobby.id) throw new Error('Lobby does not exist or has no ID');

        const lobbyId = lobby.id;
        const validation = await gameService.validateVote(lobbyId, username, vote);
        if (!validation.isValid) {
          socket.emit('error', { message: validation.error });
          return;
        }
        if (lobby.phase !== GamePhase.VOTING) throw new Error('Voting is not currently allowed - not in voting phase');

        const currentLobbyRound = lobby.current_round;
        if (currentLobbyRound === null || currentLobbyRound === undefined) throw new Error('Could not determine current round for voting.');

        const voteRecorded = await gameService.recordVote(lobbyId, username, vote, currentLobbyRound);
        if (!voteRecorded) {
          socket.emit('error', { message: 'Failed to record vote' });
          return;
        }

        socket.emit('vote-submitted', { username, vote });
        socket.to(lobbyId).emit('player-voted', { username });

        const [activePlayers, submittedVotes] = await Promise.all([
          db.all('SELECT COUNT(*) as count FROM players WHERE lobby_id = ?', [lobbyId]),
          db.all('SELECT COUNT(*) as count FROM votes WHERE lobby_id = ? AND round_number = ?', [lobbyId, currentLobbyRound])
        ]);

        if (activePlayers[0].count === submittedVotes[0].count) {
          const roundResult = await gameService.calculateRoundResults(lobbyId);
          io?.to(lobbyId).emit('voting-complete', roundResult);

          const finalResults = await gameService.calculateFinalResults(lobbyId);

          const nextAction = await gameService.endRound(lobbyId, roundResult, {}, io as Server);

          if (nextAction === 'game_end') {
            io?.to(lobbyId).emit('game-end', finalResults);
          }
        }
      } catch (error) {
        console.error('Error processing vote:', error);
        socket.emit('error', { message: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    socket.on('leave-lobby', async ({ lobbyCode, username }) => {
      try {
        const leaveResult = await lobbyService.leaveLobby(lobbyCode, username);
        if (!leaveResult.success) throw new Error(leaveResult.error || 'Failed to leave lobby');

        const lobby = await lobbyService.getLobby(lobbyCode);

        connectionManager.removeConnection(socket.id);

        socket.leave(lobbyCode);

        if (lobby && lobby.id) {
          io?.to(lobby.id).emit('player-left', { username });
          if (!leaveResult.lobbyClosed) {
            const playersResult = await lobbyService.getLobbyPlayers(lobbyCode);
            if (playersResult.success && playersResult.players) {
              io?.to(lobby.id).emit('player-list', { players: playersResult.players });
            }
          }
        }

        if (leaveResult.lobbyClosed) {
          console.log(`Lobby ${lobbyCode} closed due to inactivity.`);
        }
      } catch (error) {
        console.error('Error leaving lobby:', error);
        socket.emit('error', { message: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    socket.on('return-to-lobby', async ({ lobbyCode, username }) => {
      try {
        const db = getDB();
        const lobby = await lobbyService.getLobby(lobbyCode);
        if (!lobby) {
          socket.emit('error', { message: 'Lobby not found' });
          return;
        }

        await db.run('UPDATE lobbies SET status = \'waiting\', phase = ? WHERE id = ?', [GamePhase.WAITING, lobby.id]);

        await db.run(`UPDATE players SET operation_assigned = 0, operation_accepted = 0, eliminated = 0, win_status = NULL WHERE lobby_id = ?`, [lobby.id]);

        await db.run('DELETE FROM votes WHERE lobby_id = ?', [lobby.id]);
        await db.run('DELETE FROM rounds WHERE lobby_id = ?', [lobby.id]);

        const playersResult = await lobbyService.getLobbyPlayers(lobbyCode);
        if (playersResult.success && playersResult.players) {
          io?.to(lobby.id).emit('lobby-state', { lobbyId: lobby.id, lobbyCode: lobby.lobbyCode, status: 'waiting', phase: GamePhase.WAITING, players: playersResult.players, updatedAt: new Date().toISOString() });
          io?.to(lobby.id).emit('player-list', { players: playersResult.players });
        }

        console.log(`Lobby ${lobbyCode} reset to waiting phase`);
      } catch (error) {
        console.error('Error returning to lobby:', error);
        socket.emit('error', { message: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    socket.on('disconnect', async () => {
      const username = connectionManager.getUsername(socket.id);
      console.log(`Socket ${socket.id} for user ${username} disconnected`);
      await connectionManager.handleDisconnect(socket.id, io as Server);
    });

    socket.on('get-lobby-players', async ({ lobbyCode }, callback) => {
      try {
        const result = await lobbyService.getLobbyPlayers(lobbyCode);
        if (result.success && result.players) {
          const lobby = await lobbyService.getLobby(lobbyCode);
          if (lobby && lobby.id) {
            io?.to(lobby.id).emit('player-list', { players: result.players });
          }
          if (callback) callback({ success: true, players: result.players });
        } else {
          if (callback) callback({ success: false, error: result.error || 'Could not retrieve players' });
        }
      } catch (error) {
        console.error('Error retrieving lobby players:', error);
        if (callback) callback({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });
  });

  return io;
}
