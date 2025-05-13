import express, { Application, Request, Response } from 'express';
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { initDB, getDB } from "./db/db";

enum GamePhase {
  WAITING = 'waiting',
  TEAM_ASSIGNMENT = 'team_assignment',
  OPERATION_ASSIGNMENT = 'operation_assignment',
  VOTING = 'voting',
}

interface RoundResult {
    winner: 'agents' | 'impostors';
    eliminatedPlayers: string[];
    votes: Record<string, string>;
    roundNumber: number;
}

interface FinalResults {
    overallWinner: 'agents' | 'impostors';
    roundResults: RoundResult[];
    mvp: string;
    totalRounds: number;
    teamScores: {
        agents: number;
        impostors: number;
    };
}

interface VoteValidationResult {
    isValid: boolean;
    error?: string;
}

async function updateLobbyPhase(lobbyId: string, phase: GamePhase) {
    // Update in database
    const dbInstance = getDB();
    await dbInstance.run(
        "UPDATE lobbies SET phase = ? WHERE id = ?",
        [phase, lobbyId]
    );

    // Update in memory if lobby exists
    if (lobbies[lobbyId]) {
        lobbies[lobbyId].phase = phase;
    }

    return true;
}

async function validateVote(
    lobbyId: string,
    voter: string,
    target: string
): Promise<VoteValidationResult> {
    const db = getDB();

    try {
        // Check if lobby is in voting phase
        const lobby = await db.get(`
            SELECT phase, current_round 
            FROM lobbies 
            WHERE id = ?
        `, [lobbyId]);

        if (!lobby) {
            return {
                isValid: false,
                error: "Lobby not found"
            };
        }

        if (lobby.phase !== 'voting') {
            return {
                isValid: false,
                error: "Voting is not currently allowed"
            };
        }

        // Check if voter exists and is not eliminated
        const voterPlayer = await db.get(`
            SELECT eliminated 
            FROM players 
            WHERE lobby_id = ? AND username = ?
        `, [lobbyId, voter]);

        if (!voterPlayer) {
            return {
                isValid: false,
                error: "Voter not found in lobby"
            };
        }

        if (voterPlayer.eliminated === 1) {
            return {
                isValid: false,
                error: "Eliminated players cannot vote"
            };
        }

        // Check if target exists
        const targetPlayer = await db.get(`
            SELECT eliminated 
            FROM players 
            WHERE lobby_id = ? AND username = ?
        `, [lobbyId, target]);

        if (!targetPlayer) {
            return {
                isValid: false,
                error: "Target player not found in lobby"
            };
        }

        // Prevent self-voting
        if (voter === target) {
            return {
                isValid: false,
                error: "You cannot vote for yourself"
            };
        }

        // Check if player has already voted
        const existingVote = await db.get(`
            SELECT id 
            FROM votes 
            WHERE lobby_id = ? AND voter = ?
        `, [lobbyId, voter]);

        if (existingVote) {
            return {
                isValid: false,
                error: "You have already voted this round"
            };
        }

        // Check if target is eliminated
        if (targetPlayer.eliminated === 1) {
            return {
                isValid: false,
                error: "Cannot vote for an eliminated player"
            };
        }

        return {
            isValid: true
        };
    } catch (error) {
        console.error("Error validating vote:", error);
        return {
            isValid: false,
            error: "Internal server error during vote validation"
        };
    }
}


interface Lobby {
    lobbyCode: string;
    players: string[];
    status: 'waiting' | 'playing' | 'completed';
    phase: GamePhase; // Add phase tracking
}

export const app: Application = express();
const server = createServer(app);

const io = new Server(server, {
    cors: {
        origin: `${process.env.CLIENT_ORIGIN || 'http://localhost:5000'}`,
        methods: ["GET", "POST"],
        credentials: true
    }
});

const lobbies: Record<string, Lobby> = {};
const userSockets: Record<string, string> = {}; // Speichert die Zuordnung von Username zu Socket-ID

// Add a map to track active connections
const activeConnections = new Map<string, string>(); // socketId -> username

// Validate username (example validation)
const isValidUsername = (username: string): boolean => {
    return username.length >= 2 && username.length <= 20 && /^[a-zA-Z0-9_]+$/.test(username);
};

// Generate lobby code with more randomness
const generateLobbyCode = (): string => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

async function startNewRound(lobbyId: string, roundNumber: number) {
    const db = getDB();

    // Reset votes for the new round
    await db.run("DELETE FROM votes WHERE lobby_id = ?", [lobbyId]);

    // Reset player elimination status but keep their teams
    await db.run(`
        UPDATE players
        SET eliminated = 0
        WHERE lobby_id = ?
    `, [lobbyId]);

    // Update lobby phase
    await db.run(`
        UPDATE lobbies
        SET phase = ?, current_round = ?
        WHERE id = ?
    `, ['team_assignment', roundNumber, lobbyId]);

    // Create new round entry
    await db.run(`
        INSERT INTO rounds (lobby_id, round_number, completed)
        VALUES (?, ?, 0)
    `, [lobbyId, roundNumber]);

    // Update in-memory state if lobby exists
    if (lobbies[lobbyId]) {
        lobbies[lobbyId].phase = GamePhase.TEAM_ASSIGNMENT;
        // Update any other relevant state
    }

    return true;
}
async function calculateRoundResults(lobbyId: string): Promise<RoundResult> {
    const db = getDB();

    // Get current round number
    const lobby = await db.get(`
        SELECT current_round FROM lobbies WHERE id = ?
    `, [lobbyId]);

    // Get all active players and their teams
    const players = await db.all(`
        SELECT username, team 
        FROM players 
        WHERE lobby_id = ? AND eliminated = 0
    `, [lobbyId]);

    // Get all votes for this round
    const votes = await db.all(`
        SELECT voter, target 
        FROM votes 
        WHERE lobby_id = ?
    `, [lobbyId]);

    // Convert votes to Record format
    const voteRecord: Record<string, string> = {};
    votes.forEach(vote => {
        voteRecord[vote.voter] = vote.target;
    });

    // Count votes for each player
    const voteCounts: Record<string, number> = {};
    players.forEach(player => {
        voteCounts[player.username] = 0;
    });
    votes.forEach(vote => {
        if (voteCounts[vote.target] !== undefined) {
            voteCounts[vote.target]++;
        }
    });

    // Find player(s) with most votes
    const maxVotes = Math.max(...Object.values(voteCounts));
    const eliminatedPlayers = Object.entries(voteCounts)
        .filter(([_, count]) => count === maxVotes)
        .map(([player]) => player);

    // Update eliminated status in database
    for (const player of eliminatedPlayers) {
        await db.run(`
            UPDATE players 
            SET eliminated = 1 
            WHERE lobby_id = ? AND username = ?
        `, [lobbyId, player]);
    }

    // Count remaining players on each team
    const remainingPlayers = players.filter(p => !eliminatedPlayers.includes(p.username));
    const teamCounts = remainingPlayers.reduce((acc, player) => {
        acc[player.team] = (acc[player.team] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    // Determine round winner
    let winner: 'agents' | 'impostors';
    if (teamCounts['impostor'] === 0) {
        winner = 'agents';
    } else if (teamCounts['agent'] <= teamCounts['impostor']) {
        winner = 'impostors';
    } else {
        winner = 'agents';
    }

    await processSpecialOperations(lobbyId, {
        winner,
        eliminatedPlayers,
        votes: voteRecord,
        roundNumber: lobby.current_round
    });


    // Store round result
    await db.run(`
        UPDATE rounds 
        SET winner = ?, completed = 1 
        WHERE lobby_id = ? AND round_number = ?
    `, [winner, lobbyId, lobby.current_round]);

    return {
        winner,
        eliminatedPlayers,
        votes: voteRecord,
        roundNumber: lobby.current_round
    };
}

async function calculateFinalResults(lobbyId: string): Promise<FinalResults> {
    const db = getDB();

    // Get all round results
    const rounds = await db.all(`
        SELECT round_number, winner 
        FROM rounds 
        WHERE lobby_id = ? 
        ORDER BY round_number
    `, [lobbyId]);

    // Calculate team scores
    const teamScores = {
        agents: 0,
        impostors: 0
    };
    rounds.forEach(round => {
        if (round.winner === 'agents') teamScores.agents++;
        if (round.winner === 'impostors') teamScores.impostors++;
    });

    // Get all players and their stats
    const players = await db.all(`
        SELECT p.username, p.team,
               COUNT(v.target) as times_voted_out,
               COUNT(CASE WHEN r.winner = p.team THEN 1 END) as rounds_won
        FROM players p
        LEFT JOIN votes v ON v.target = p.username
        LEFT JOIN rounds r ON r.lobby_id = p.lobby_id
        WHERE p.lobby_id = ?
        GROUP BY p.username
    `, [lobbyId]);

    // Calculate MVP based on rounds won and times survived
    const mvp = players.reduce((prev, current) => {
        const prevScore = prev.rounds_won - prev.times_voted_out;
        const currentScore = current.rounds_won - current.times_voted_out;
        return currentScore > prevScore ? current : prev;
    }).username;

    // Get detailed round results
    const roundResults = await Promise.all(rounds.map(async round => {
        // Get votes for the round by joining with the rounds table
        const votes = await db.all(`
            SELECT v.voter, v.target
            FROM votes v
                     JOIN lobbies l ON l.id = v.lobby_id
            WHERE v.lobby_id = ? AND l.current_round = ?
        `, [lobbyId, round.round_number]);

        const eliminatedPlayers = await db.all(`
            SELECT username
            FROM players
            WHERE lobby_id = ? AND eliminated = 1
        `, [lobbyId]);

        return {
            winner: round.winner as 'agents' | 'impostors',
            eliminatedPlayers: eliminatedPlayers.map(p => p.username),
            votes: votes.reduce((acc, vote) => {
                acc[vote.voter] = vote.target;
                return acc;
            }, {} as Record<string, string>),
            roundNumber: round.round_number
        };

    }));

    return {
        overallWinner: teamScores.agents > teamScores.impostors ? 'agents' : 'impostors',
        roundResults,
        mvp,
        totalRounds: rounds.length,
        teamScores
    };
}

// Helper function to process special operations after voting
async function processSpecialOperations(lobbyId: string, roundResult: RoundResult) {
    const db = getDB();

    // Get all players with special operations
    const players = await db.all(`
        SELECT username, operation, operation_info 
        FROM players 
        WHERE lobby_id = ? AND operation IS NOT NULL
    `, [lobbyId]);

    for (const player of players) {
        // Only process operations that have modifyWinCondition defined
        const operation = OPERATION_CONFIG[player.operation];
        if (!operation?.modifyWinCondition) continue;

        try {
            // Get teams mapping for all players
            const allPlayers = await db.all(`
                SELECT username, team 
                FROM players 
                WHERE lobby_id = ?
            `, [lobbyId]);

            const teamsMap = allPlayers.reduce((acc, p) => {
                acc[p.username] = p.team;
                return acc;
            }, {} as Record<string, string>);

            // Call the operation's modifyWinCondition function with the correct parameters
            await operation.modifyWinCondition(
                lobbyId,
                allPlayers.map(p => p.username),
                roundResult.votes,
                teamsMap,
                db
            );
        } catch (error) {
            console.error(`Error processing operation ${player.operation} for player ${player.username}:`, error);
        }
    }

}




// Configuration object for game rules
const GAME_CONFIG = {
    MIN_PLAYERS: 5,
    MAX_PLAYERS: 10,
    IMPOSTOR_THRESHOLDS: [
        { min: 5, max: 6, count: 2 },
        { min: 7, max: 10, count: 3 }
    ],
    OPERATIONS: [
        {name: "grudge", hidden: true},
        {name: "infatuation", hidden: true},
        {name: "scapegoat", hidden: true},
        {name: "sleeper agent", hidden: true},
        {name: "secret intel", hidden: true},
        {name: "secret tip", hidden: true},
        {name: "confession", hidden: false},
        {name: "secret intel", hidden: false},
        {name: "old photographs", hidden: false},
        {name: "danish intelligence", hidden: false},
        {name: "anonymous tip", hidden: false},
        {name: "defector", hidden: true},
    ]
};

const OPERATION_CONFIG: Record<
    string, {
        fields: string[];
        types: string[];
        generateInfo?: (players: string[], teams: Record<string, string>, self: string) => any;
        modifyWinCondition?: (lobbyId: string, players: string[], votes: Record<string, string>, teams: Record<string, string>, db: any) => Promise<void>;
    }
> = {
    "grudge": {
        fields: [], // No input needed from the player for this version of grudge
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const selfTeam = teams[self];
            // Safety check for player's team
            if (!selfTeam) {
                console.warn(`Player ${self} has no team assigned for grudge operation.`);
                return { message: "Could not determine your grudge target due to missing team information." };
            }

            // Find players on opposing teams
            const opponents = players.filter(p => p !== self && teams[p] && teams[p] !== selfTeam);

            if (opponents.length === 0) {
                // This could happen if all other players are on the same team, or in very small setups
                return { message: "No specific grudge target could be identified from opposing teams." };
            }

            // Select a random opponent as the grudge target
            const randomOpponent = opponents[Math.floor(Math.random() * opponents.length)];
            
            // The player with the grudge is informed who their target is.
            // They can use this information strategically (e.g., in accusations, voting).
            return {
                grudgeTarget: randomOpponent,
                message: `You have a grudge against ${randomOpponent}. You might want to focus your suspicions or actions towards them.`
            };
        },
        modifyWinCondition: async () => {}, // No direct change to win conditions for this informational grudge.
                                          // This could be expanded later if a grudge should have a mechanical impact on winning.
    },
    "infatuation": {
        fields: [],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            // Filter out the current player to avoid self-infatuation
            const otherPlayers = players.filter(p => p !== self);

            if (otherPlayers.length === 0) {
                return {
                    message: "No valid target for infatuation found.",
                    success: false
                };
            }

            // Randomly select another player to be infatuated with
            const infatuationTarget = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];

            return {
                infatuationTarget,
                targetTeam: teams[infatuationTarget],
                message: `You are infatuated with ${infatuationTarget}. Your fate is tied to theirs - you will win only if they win!`,
                success: true
            };
        },
        modifyWinCondition: async (
            lobbyId: string,
            players: string[],
            votes: Record<string, string>,
            teams: Record<string, string>,
            db: any
        ) => {
            // Get all players with infatuation operation
            const infatuatedPlayers = await db.all(
                "SELECT username, operation_info FROM players WHERE lobby_id = ? AND operation = 'infatuation'",
                [lobbyId]
            );

            for (const player of infatuatedPlayers) {
                if (!player.operation_info) continue;

                try {
                    const info = JSON.parse(player.operation_info);
                    if (!info.success || !info.infatuationTarget) continue;

                    // Get the target's win status
                    const targetPlayer = await db.get(
                        "SELECT win_status FROM players WHERE lobby_id = ? AND username = ?",
                        [lobbyId, info.infatuationTarget]
                    );

                    if (!targetPlayer) continue;

                    // Update the infatuated player's win status to match their target's
                    await db.run(
                        "UPDATE players SET win_status = ? WHERE lobby_id = ? AND username = ?",
                        [targetPlayer.win_status, lobbyId, player.username]
                    );
                } catch (error) {
                    console.error(`Error processing infatuation for player ${player.username}:`, error);
                }
            }
        }
    },
    "sleeper agent": {
        fields: [],
        types: [],
        // The player receiving this operation will switch their team to the opposite side
        generateInfo: (players, teams, self) => {
            const otherPlayers = players.filter(p => p !== self);
            if (otherPlayers.length === 0) return null;

            const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
            return { targetPlayer: randomPlayer, targetTeam: teams[randomPlayer] };
        },
        modifyWinCondition: async () => {}, // No effect on win condition
    },
    "anonymous tip": {
        fields: ["message"],
        types: ["string"],
        generateInfo: (players, teams, self) => {
            const otherPlayers = players.filter(p => p !== self);
            if (otherPlayers.length === 0) return null;

            const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
            return { revealedPlayer: randomPlayer, team: teams[randomPlayer] };
        },
        modifyWinCondition: async () => {}, // No effect on win condition
    },
    // choose two players, one player is an agent and one is an impostor
    "danish intelligence": {
        fields: [],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            // Filter out the current player
            const otherPlayers = players.filter(p => p !== self);

            // Separate players into impostors and agents
            const impostors = otherPlayers.filter(p => teams[p] === "impostor");
            const agents = otherPlayers.filter(p => teams[p] === "agent");

            // Check if we have enough players of each type
            if (impostors.length === 0 || agents.length === 0) {
                return {
                    success: false,
                    message: "Not enough players to generate intelligence information."
                };
            }

            // Randomly select one impostor and one agent
            const revealedImpostor = impostors[Math.floor(Math.random() * impostors.length)];
            const revealedAgent = agents[Math.floor(Math.random() * agents.length)];

            return {
                success: true,
                revealedImpostor,
                revealedAgent,
                message: `Your intelligence reveals that ${revealedImpostor} is an impostor and ${revealedAgent} is an agent.`
            };
        },
        modifyWinCondition: async () => {
            // Danish Intelligence doesn't modify win conditions
            // It's purely an information-gathering operation
        }
    },
    // Make sure to define other operations like "scapegoat", "secret intel" etc., if they are used from GAME_CONFIG.OPERATION
    // the receiver chooses one player who receives the team associated with the receiver of this operation
    "confession": {
        fields: ["targetPlayer"],
        types: ["string"],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            // Filter out the current player
            const possibleTargets = players.filter(p => p !== self);

            return {
                success: true,
                message: "Choose a player to confess your team allegiance to.",
                availablePlayers: possibleTargets,
                myTeam: teams[self]
            };
        },
        modifyWinCondition: async () => {
            // Confession doesn't modify win conditions
            return;
        }
    },
    // the receiver recieves two names of players who work for the same team
    "old photographs": {
        fields: [],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            // Filter out the current player
            const otherPlayers = players.filter(p => p !== self);

            // Group players by their team
            const teamGroups: Record<string, string[]> = {};
            otherPlayers.forEach(player => {
                const team = teams[player];
                if (!teamGroups[team]) {
                    teamGroups[team] = [];
                }
                teamGroups[team].push(player);
            });

            // Find a team that has at least 2 players
            let selectedTeam: string | null = null;
            let selectedPlayers: string[] = [];

            for (const [team, players] of Object.entries(teamGroups)) {
                if (players.length >= 2) {
                    selectedTeam = team;
                    // Randomly select 2 players from this team
                    const shuffled = [...players].sort(() => Math.random() - 0.5);
                    selectedPlayers = shuffled.slice(0, 2);
                    break;
                }
            }

            if (!selectedTeam || selectedPlayers.length < 2) {
                return {
                    success: false,
                    message: "Not enough players on the same team to generate photographs."
                };
            }

            return {
                success: true,
                revealedPlayers: selectedPlayers,
                message: `Your old photographs show that ${selectedPlayers[0]} and ${selectedPlayers[1]} are on the same team.`
            };
        },
        modifyWinCondition: async () => {
            // Old Photographs doesn't modify win conditions
            return;
        }
    },
    "defector": {
        fields: ["targetPlayer"],
        types: ["string"],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            // Filter out the current player
            const possibleTargets = players.filter(p => p !== self);

            return {
                success: true,
                message: "Choose a player to convert to the opposite team.",
                availablePlayers: possibleTargets
            };
        },
        modifyWinCondition: async (
            lobbyId: string,
            players: string[],
            votes: Record<string, string>,
            teams: Record<string, string>,
            db: any
        ) => {
            // Get all players with defector operation
            const defectorPlayers = await db.all(
                "SELECT username, operation_info FROM players WHERE lobby_id = ? AND operation = 'defector'",
                [lobbyId]
            );

            for (const player of defectorPlayers) {
                if (!player.operation_info) continue;

                try {
                    const info = JSON.parse(player.operation_info);
                    if (!info.targetPlayer || info.teamChanged) continue;

                    // Get the target player's current team
                    const targetPlayer = await db.get(
                        "SELECT team FROM players WHERE lobby_id = ? AND username = ?",
                        [lobbyId, info.targetPlayer]
                    );

                    if (!targetPlayer) continue;

                    // Switch the team (impostor <-> agent)
                    const newTeam = targetPlayer.team === 'impostor' ? 'agent' : 'impostor';

                    // Update the target player's team
                    await db.run(
                        "UPDATE players SET team = ? WHERE lobby_id = ? AND username = ?",
                        [newTeam, lobbyId, info.targetPlayer]
                    );

                    // Mark the operation as completed
                    await db.run(
                        "UPDATE players SET operation_info = json_patch(operation_info, ?) WHERE lobby_id = ? AND username = ?",
                        [JSON.stringify({ teamChanged: true }), lobbyId, player.username]
                    );

                    // Update the teams object to reflect the change
                    teams[info.targetPlayer] = newTeam;

                } catch (error) {
                    console.error(`Error processing defector operation for player ${player.username}:`, error);
                }
            }
        }
    },
};

// Initialize SQLite database
let dbInstance: any;

const initializeDatabase = async (useInMemory: boolean = false) => {
    try {
        dbInstance = await initDB(useInMemory);
        console.log("Database initialized with fresh tables");
    } catch (error) {
        console.error("Failed to initialize database:", error);
        process.exit(1); // Exit if database initialization fails
    }
};

// Middleware
app.use(express.json());

// Update CORS configuration to dynamically use CLIENT_ORIGIN from the environment variables
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5000",
    credentials: true,
}));

// More robust lobby creation
app.post("/create-lobby", async (req: Request, res: Response) => {
    try {
        const { username } = req.body;
        const dbInstance = getDB(); // Get the database instance safely

        const lobbyId = Math.random().toString(36).substring(2, 8);
        const lobbyCode = generateLobbyCode();

        await dbInstance.run("INSERT INTO lobbies (id, lobby_code, status, phase) VALUES (?, ?, 'waiting', ?)", [lobbyId, lobbyCode, GamePhase.WAITING]);
        lobbies[lobbyId] = { lobbyCode, players: [username], status: "waiting", phase: GamePhase.WAITING };

        await dbInstance.run("INSERT INTO players (username, lobby_id, team) VALUES (?, ?, ?)", [username, lobbyId, "agent"]);
        
        // Emit player list to all clients in the lobby
        io.to(lobbyId).emit("player-list", { players: lobbies[lobbyId].players });
        
        res.json({ lobbyId, lobbyCode });
    } catch (error) {
        console.error("Fehler beim Erstellen der Lobby:", error);
        res.status(500).json({ error: 'Failed to create lobby' });
    }


});

// More comprehensive game start logic
const assignTeamsAndOperations = async (lobbyId: string, players: string[]) => {
    const db = getDB();

    // Determine impostors
    const impostorConfig = GAME_CONFIG.IMPOSTOR_THRESHOLDS.find(
        config => players.length >= config.min && players.length <= config.max
    );

    if (!impostorConfig) throw new Error("Invalid number of players");

    const shuffledPlayers = players.slice().sort(() => 0.5 - Math.random());
    const impostors = shuffledPlayers.slice(0, impostorConfig.count);
    const agents = shuffledPlayers.slice(impostorConfig.count);

    // Store teams in a dictionary
    const teams: Record<string, string> = {};
    for (const player of impostors) teams[player] = "impostor";
    for (const player of agents) teams[player] = "agent";

    // Assign teams in DB
    for (const player of players) {
        await db.run("UPDATE players SET team = ? WHERE username = ?", [teams[player], player]);
    }

    // Shuffle & assign operations
    const shuffledOperations = GAME_CONFIG.OPERATIONS.slice().sort(() => 0.5 - Math.random());
    const playerOperations = players.map((player, index) => ({
        player,
        operation: shuffledOperations[index] || "default-operation"
    }));

    for (const { player, operation } of playerOperations) {
        await db.run("UPDATE players SET operation = ? WHERE username = ?", [operation.name, player]);
    }

    // Generate additional operation information and send it to players
    await generateOperationInfo(lobbyId, players, teams);

    // Notify players of their team (you might want to send this individually as well)
    io.to(lobbyId).emit("team-assignment", {
        impostors,
        agents,
        phase: GamePhase.OPERATION_ASSIGNMENT,
        requiresAcknowledgment: true
    });


    return { impostors, agents, playerOperations };
};


async function endRound(lobbyId: string, roundResult: RoundResult) {
    const db = getDB();

    // Update round results
    await db.run(`
        UPDATE rounds 
        SET winner = ?, completed = 1 
        WHERE lobby_id = ? AND round_number = (
            SELECT current_round FROM lobbies WHERE id = ?
        )
    `, [roundResult.winner, lobbyId, lobbyId]);

    // Get lobby information
    const lobby = await db.get(`
        SELECT current_round, total_rounds 
        FROM lobbies 
        WHERE id = ?
    `, [lobbyId]);

    if (!lobby) return false;

    // Check if this was the final round
    if (lobby.current_round >= lobby.total_rounds) {
        await db.run(`
            UPDATE lobbies 
            SET status = 'completed', phase = 'completed' 
            WHERE id = ?
        `, [lobbyId]);
        return 'game_end';
    }

    // Start next round
    await startNewRound(lobbyId, lobby.current_round + 1);
    return 'next_round';
}


const generateOperationInfo = async (lobbyId: string, players: string[], teams: Record<string, string>) => {
    const db = getDB();

    for (const player of players) {
        const operationRow = await db.get(
            "SELECT operation FROM players WHERE username = ? AND lobby_id = ?",
            [player, lobbyId]
        );

        if (!operationRow || !operationRow.operation) continue;

        const operation = operationRow.operation;
        const config = OPERATION_CONFIG[operation];
        if (!config || !config.generateInfo) continue;

        const generatedInfo = config.generateInfo(players, teams, player);
        await db.run(
            "UPDATE players SET operation_info = ? WHERE username = ?",
            [JSON.stringify(generatedInfo), player]
        );

        const socketId = userSockets[player]; // Hole die Socket-ID anhand des Usernamens
        if (socketId) {
            io.to(socketId).emit("operation-prepared", { // Sende an den spezifischen Socket
                operation,
                info: generatedInfo,
            });
            console.log(`Operation '${operation}' mit Info gesendet an <span class="math-inline">\{player\} \(</span>{socketId})`);
        } else {
            console.warn(`Socket-ID für Spieler ${player} nicht gefunden.`);
        }
    }
};


// More robust socket event handlers in the connection logic
io.on("connection", (socket: Socket) => {
    console.log("New client connected:", socket.id);

    // Clean up any existing socket for this user
    const cleanupOldSocket = (username: string) => {
        const oldSocketId = userSockets[username];
        if (oldSocketId && oldSocketId !== socket.id) { // Ensure it doesn't disconnect the current socket
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            if (oldSocket) {
                oldSocket.disconnect(true);
            }
            delete userSockets[username];
            activeConnections.delete(oldSocketId);
        }
    };

    socket.on("rejoin-game", async ({ lobbyCode, username }) => {
        try {
            cleanupOldSocket(username);
            const db = getDB();
            const lobby = await db.get("SELECT id FROM lobbies WHERE lobby_code = ?", [lobbyCode]);
            
            if (!lobby) {
                socket.emit("error", { message: "Lobby not found" });
                return;
            }

            // Get current game state
            const gameState = await db.get("SELECT status, round, total_rounds FROM lobbies WHERE id = ?", [lobby.id]);
            const players = await db.all("SELECT username, team, operation FROM players WHERE lobby_id = ?", [lobby.id]);
            
            // Update socket mapping
            userSockets[username] = socket.id;
            activeConnections.set(socket.id, username);
            socket.join(lobby.id);

            // Send current state to the reconnecting player
            socket.emit("game-state", {
                currentState: gameState.status,
                round: gameState.round,
                totalRounds: gameState.total_rounds
            });

            socket.emit("player-list", { players });

            // Notify other players
            socket.to(lobby.id).emit("game-message", {
                type: "system",
                text: `${username} has reconnected`
            });
        } catch (error) {
            console.error("Error in rejoin-game:", error);
            socket.emit("error", { message: "Failed to rejoin game" });
        }
    });

    socket.on("join-lobby", async (data: { username: string; lobbyCode: string }, callback?: (response: any) => void) => {
        try {
            const { username, lobbyCode } = data;
            cleanupOldSocket(username);
            if (!isValidUsername(username)) {
                if (callback) {
                    callback({ 
                        success: false, 
                        error: "Invalid username" 
                    });
                }
                return;
            }



            const dbInstance = getDB();
            const lobby = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);


            if (!lobby) {
                if (callback) {
                    callback({ 
                        success: false, 
                        error: "Lobby does not exist" 
                    });
                }
                return;
            }

            const [lobbyId, lobbyData] = lobby;

            if (lobbyData.players.length >= GAME_CONFIG.MAX_PLAYERS) {
                if (callback) {
                    callback({
                        success: false,
                        error: `Lobby is full. Maximum ${GAME_CONFIG.MAX_PLAYERS} players allowed.`
                    });
                }
                return;
            }

            if (lobbyData.status !== "waiting") {
                if (callback) {
                    callback({ 
                        success: false, 
                        error: "Game has already started" 
                    });
                }
                return;
            }

            // Check if player is already in the lobby
            const existingPlayer = await dbInstance.get(
                "SELECT * FROM players WHERE username = ? AND lobby_id = ?",
                [username, lobbyId]
            );

            if (existingPlayer) {
                if (callback) {
                    callback({ 
                        success: false, 
                        error: "You are already in this lobby" 
                    });
                }
                return;
            }

            // Check if username is taken in any lobby
            const usernameTaken = await dbInstance.get(
                "SELECT * FROM players WHERE username = ?",
                [username]
            );

            if (usernameTaken) {
                if (callback) {
                    callback({ 
                        success: false, 
                        error: "Username is already taken" 
                    });
                }
                return;
            }

            // Add player to database
            await dbInstance.run(
                "INSERT INTO players (username, lobby_id, team) VALUES (?, ?, '')",
                [username, lobbyId]
            );

            // Add player to lobby
            lobbies[lobbyId].players.push(username);
            userSockets[username] = socket.id;
            activeConnections.set(socket.id, username);
            socket.join(lobbyId);
            
            // Send to all clients in the lobby (including the new player)
            io.to(lobbyId).emit("player-joined", { username, lobbyId });
            
            // Emit updated player list to all clients in the lobby
            io.to(lobbyId).emit("player-list", { players: lobbies[lobbyId].players });
            
            // Send acknowledgment to the joining client
            if (callback) {
                callback({ 
                    success: true,
                    lobbyCode,
                    players: lobbies[lobbyId].players 
                });
            }

            console.log(`Player ${username} joined lobby ${lobbyCode}`);

        } catch (error) {
            console.error("Error joining lobby:", error);
            if (callback) {
                callback({ 
                    success: false, 
                    error: error instanceof Error ? error.message : "Unknown error" 
                });
            }
        }
    });

    // Handle game start logic
    socket.on("start-game", async ({ lobbyCode, rounds = 3 }) => {
        try {
            const dbInstance = getDB();
            const lobbyEntry = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);

            // Check if lobby exists and is in waiting state
            if (!lobbyEntry) {
                throw new Error("Lobby does not exist");
            }

            // Destructure the lobby data
            const [lobbyId, lobbyData] = lobbyEntry;

            // Check if the game has already started
            if (lobbyData.status !== "waiting") {
                throw new Error("Game has already started");
            }

            // Check if there are enough players to start the game
            if (lobbyData.players.length < GAME_CONFIG.MIN_PLAYERS) {
                throw new Error(`Not enough players. Minimum required: ${GAME_CONFIG.MIN_PLAYERS}`);
            }

            // Start game with first phase: TEAM_ASSIGNMENT
            lobbyData.status = "playing";
            lobbyData.phase = GamePhase.TEAM_ASSIGNMENT;


            await dbInstance.run(`
                UPDATE lobbies 
                SET total_rounds = ?, current_round = 1 
                WHERE id = ?
            `, [rounds, lobbyId]);

            await startNewRound(lobbyId, 1);


            await dbInstance.run(
                "UPDATE lobbies SET status = ?, phase = ? WHERE id = ?",
                ["playing", GamePhase.TEAM_ASSIGNMENT, lobbyId]
            );

            // Notify all players that the game has started
            io.to(lobbyId).emit("game-started", { 
                message: "Game has started!",
                players: lobbyData.players,
                phase: GamePhase.TEAM_ASSIGNMENT
            });

            // Begin TEAM_ASSIGNMENT phase - this happens automatically
            console.log("Starting team assignment phase...");
            
            // Assign teams and operations immediately
            const { impostors, agents, playerOperations } = await assignTeamsAndOperations(lobbyId, lobbyData.players);
            
            // Update lobby phase to OPERATION_ASSIGNMENT
            lobbyData.phase = GamePhase.OPERATION_ASSIGNMENT;
            await dbInstance.run(
                "UPDATE lobbies SET phase = ? WHERE id = ?",
                [GamePhase.OPERATION_ASSIGNMENT, lobbyId]
            );

            // Emit event: Only send team assignments
            io.to(lobbyId).emit("team-assignment", {
                impostors,
                agents,
                phase: GamePhase.OPERATION_ASSIGNMENT
            });

            console.log("Teams assigned. Operation phase starting...");

            // Operation Assignment Phase 
            console.log("Starting operation assignment...");

            // Apply operations to players
            for (const { player, operation } of playerOperations) {
                if (operation) {
                    await dbInstance.run(
                        "UPDATE players SET operation = ? WHERE username = ? AND lobby_id = ?",
                        [operation.name, player, lobbyId]
                    );

                    // Notify only the specific player about their operation
                    const playerSocketId = userSockets[player];
                    if (playerSocketId) {
                        io.to(playerSocketId).emit("operation-assigned", {
                            operation: operation.name
                        });
                    }

                    console.log(`Assigned operation '${operation.name}' to ${player}`);
                }
            }

            // Get player data with team assignments
            const playersData = await dbInstance.all(
                "SELECT username, team FROM players WHERE lobby_id = ?",
                [lobbyId]
            );

            // Generate operation info for players
            const teamLookup = Object.fromEntries(
                playersData.map((p: { username: string; team: string }) => [p.username, p.team])
            );
            await generateOperationInfo(lobbyId, lobbyData.players, teamLookup);

            console.log("Operation phase completed.");

            // Update lobby phase to VOTING
            lobbyData.phase = GamePhase.VOTING;
            await dbInstance.run(
                "UPDATE lobbies SET phase = ? WHERE id = ?",
                [GamePhase.VOTING, lobbyId]
            );

            // Notify all players that the operation phase is complete and voting begins
            io.to(lobbyId).emit("phase-change", {
                phase: GamePhase.VOTING,
                message: "Operation phase completed. Voting phase begins!"
            });

            console.log("Voting phase has begun");

        } catch (error) {
            socket.emit("error", { message: error instanceof Error ? error.message : "Unknown error" });
        }
    });

    socket.on("use-confession", async ({ targetPlayer, lobbyId }) => {
        try {
            const db = getDB();
            const confessor = await db.get(
                "SELECT username, team FROM players WHERE lobby_id = ? AND operation = 'confession'",
                [lobbyId]
            );

            if (!confessor) {
                socket.emit("error", { message: "Invalid confession operation" });
                return;
            }

            // Update the target player's operation_info with the confession
            const confessionInfo = {
                type: "received_confession",
                fromPlayer: confessor.username,
                theirTeam: confessor.team
            };

            await db.run(
                "UPDATE players SET operation_info = json_patch(COALESCE(operation_info, '{}'), ?) WHERE lobby_id = ? AND username = ?",
                [JSON.stringify(confessionInfo), lobbyId, targetPlayer]
            );

            // Mark the confession as used
            await db.run(
                "UPDATE players SET operation_info = json_patch(COALESCE(operation_info, '{}'), ?) WHERE lobby_id = ? AND username = ?",
                [JSON.stringify({ confessionMade: true, targetPlayer }), lobbyId, confessor.username]
            );

            // Notify relevant players
            socket.to(targetPlayer).emit("confession-received", confessionInfo);
            socket.emit("operation-used", { success: true });

        } catch (error) {
            console.error("Error processing confession:", error);
            socket.emit("error", { message: "Failed to process confession" });
        }
    });

    socket.on("submit-vote", async ({ lobbyCode, username, vote }) => {
        try {
            const dbInstance = getDB();
            const lobbyEntry = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);

            if (!lobbyEntry) {
                throw new Error("Lobby does not exist");
            }
            const [lobbyId, lobbyData] = lobbyEntry;

            const validation = await validateVote(lobbyId, username, vote);

            if (!validation.isValid) {
                socket.emit("error", { message: validation.error });
                return;
            }

            // Check if the game is in the voting phase
            if (lobbyData.phase !== GamePhase.VOTING) {
                throw new Error("Voting is not currently allowed - not in voting phase");
            }

            // Record the vote (only do this once!)
            await dbInstance.run(
                "INSERT INTO votes (lobby_id, voter, target) VALUES (?, ?, ?)",
                [lobbyId, username, vote]
            );

            // Notify clients about the vote
            socket.emit("vote-submitted", { username, vote });
            socket.to(lobbyId).emit("player-voted", { username });

            // Check if all active players have voted
            const [activePlayers, submittedVotes] = await Promise.all([
                dbInstance.all(`
                SELECT COUNT(*) as count 
                FROM players 
                WHERE lobby_id = ? AND eliminated = 0
            `, [lobbyId]),
                dbInstance.all(`
                SELECT COUNT(*) as count 
                FROM votes 
                WHERE lobby_id = ?
            `, [lobbyId])
            ]);

            // If all players have voted, trigger results calculation
            if (activePlayers[0].count === submittedVotes[0].count) {
                const roundResult = await calculateRoundResults(lobbyId);
                io.to(lobbyId).emit("voting-complete", roundResult);

                // End round and get next action
                const nextAction = await endRound(lobbyId, roundResult);

                // Update lobby data for next steps
                const lobby = await dbInstance.get("SELECT * FROM lobbies WHERE id = ?", [lobbyId]);

                if (nextAction === 'game_end') {
                    // Emit final game results
                    io.to(lobbyId).emit("game-end", await calculateFinalResults(lobbyId));
                } else {
                    // Emit round results and start next round
                    io.to(lobbyId).emit("round-end", roundResult);
                    // Use the current_round from the database, which was updated by startNewRound
                    io.to(lobbyId).emit("round-start", {
                        roundNumber: lobby.current_round
                    });
                }
            }
        } catch (error) {
            console.error("Error processing vote:", error);
            socket.emit("error", { message: error instanceof Error ? error.message : "Unknown error" });
        }
    });
    socket.on("leave-lobby", async ({ lobbyCode, username }) => {
        try {
            const dbInstance = getDB();
            const lobbyEntry = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);

            if (!lobbyEntry) {
                throw new Error("Lobby does not exist");
            }
            const [lobbyId, lobbyData] = lobbyEntry;

            lobbies[lobbyId].players = lobbyData.players.filter(player => player !== username);
            await dbInstance.run("DELETE FROM players WHERE username = ? AND lobby_id = ?", [username, lobbyId]);

            // Clean up socket connections properly
            const socketId = userSockets[username];
            if (socketId) {
                activeConnections.delete(socketId);
                delete userSockets[username];
            }

            socket.leave(lobbyId);
            io.to(lobbyId).emit("player-left", { username });

            if (lobbies[lobbyId].players.length === 0) {
                delete lobbies[lobbyId];
                await dbInstance.run("DELETE FROM lobbies WHERE id = ?", [lobbyId]);
                console.log(`Lobby ${lobbyId} closed due to inactivity.`);
            }

        } catch (error) {
            console.error("Error leaving lobby:", error);
            socket.emit("error", error instanceof Error ? error.message : "Unknown error");
        }
    });

    socket.on("disconnect", () => {
        const username = activeConnections.get(socket.id);
        if (username) {
            delete userSockets[username];
            activeConnections.delete(socket.id);
            console.log(`Socket ${socket.id} for user ${username} disconnected. Entry removed.`);
        }
    });

    socket.on("get-lobby-players", async ({ lobbyCode }, callback) => {
        try {
            const lobby = Object.entries(lobbies).find(([_, data]) => data.lobbyCode === lobbyCode);

            if (!lobby) {
                if (callback) {
                    callback({ 
                        success: false, 
                        error: "Lobby does not exist" 
                    });
                }
                return;
            }

            const [lobbyId, lobbyData] = lobby;

            if (callback) {
                callback({ 
                    success: true,
                    players: lobbyData.players.map(username => ({ username }))
                });
            }
        } catch (error) {
            console.error("Error retrieving lobby players:", error);
            if (callback) {
                callback({ 
                    success: false, 
                    error: error instanceof Error ? error.message : "Unknown error" 
                });
            }
        }
    });
});

// Update the server to use Render's dynamic port and host settings
const PORT = process.env.PORT || 5001;
const HOST = process.env.SERVER_HOST || '0.0.0.0';

export const startServer = async (port: number = parseInt(PORT.toString())) => {
  await initializeDatabase();
  return new Promise<void>((resolve) => {
    const portNumber = port;
    server.listen(portNumber, HOST, () => {
      console.log(`Server running on ${HOST}:${portNumber}`);
      resolve();
    });
  });
};

export const stopServer = () => {
  server.close();
};