import { RoundResult } from './types'; // Assuming RoundResult might be needed by OPERATION_CONFIG

// Configuration object for game rules
export const GAME_CONFIG = {
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
        {name: "secret intel", hidden: false}, // Note: "secret intel" appears twice, once hidden, once not. This might be intentional or a typo.
        {name: "old photographs", hidden: false},
        {name: "danish intelligence", hidden: false},
        {name: "anonymous tip", hidden: false},
        {name: "defector", hidden: true},
    ]
};

export const OPERATION_CONFIG: Record<
    string, {
        fields: string[];
        types: string[];
        generateInfo?: (players: string[], teams: Record<string, string>, self: string) => any;
        modifyWinCondition?: (
            lobbyId: string, 
            players: string[], 
            votes: Record<string, string>, 
            teams: Record<string, string>, 
            db: any,
            // Pass RoundResult type if needed, or define a more specific type for votes/results.
            // For now, keeping it generic.
            roundResult?: RoundResult 
        ) => Promise<void>;
    }
> = {
    "grudge": {
        fields: [], 
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const selfTeam = teams[self];
            if (!selfTeam) {
                console.warn(`Player ${self} has no team assigned for grudge operation.`);
                return { message: "Could not determine your grudge target due to missing team information." };
            }
            const opponents = players.filter(p => p !== self && teams[p] && teams[p] !== selfTeam);
            if (opponents.length === 0) {
                return { message: "No specific grudge target could be identified from opposing teams." };
            }
            const randomOpponent = opponents[Math.floor(Math.random() * opponents.length)];
            return {
                grudgeTarget: randomOpponent,
                message: `You have a grudge against ${randomOpponent}. You might want to focus your suspicions or actions towards them.`
            };
        },
        modifyWinCondition: async () => {},
    },
    "infatuation": {
        fields: [],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const otherPlayers = players.filter(p => p !== self);
            if (otherPlayers.length === 0) {
                return {
                    message: "No valid target for infatuation found.",
                    success: false
                };
            }
            const infatuationTarget = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
            return {
                infatuationTarget,
                targetTeam: teams[infatuationTarget],
                message: `You are infatuated with ${infatuationTarget}. Your fate is tied to theirs - you will win only if they win!`,
                success: true
            };
        },
        modifyWinCondition: async (lobbyId, players, votes, teams, db) => {
            const infatuatedPlayers = await db.all(
                "SELECT username, operation_info FROM players WHERE lobby_id = ? AND operation = 'infatuation'",
                [lobbyId]
            );
            for (const player of infatuatedPlayers) {
                if (!player.operation_info) continue;
                try {
                    const info = JSON.parse(player.operation_info);
                    if (!info.success || !info.infatuationTarget) continue;
                    const targetPlayer = await db.get(
                        "SELECT win_status FROM players WHERE lobby_id = ? AND username = ?",
                        [lobbyId, info.infatuationTarget]
                    );
                    if (!targetPlayer) continue;
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
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const currentTeam = teams[self];
            if (!currentTeam) {
                console.warn(`Player ${self} has no team assigned for sleeper agent operation.`);
                return {
                    success: false,
                    message: "Could not determine your current team.",
                };
            }
            const trueTeam = currentTeam === "agent" ? "impostor" : "agent";
            return {
                success: true,
                displayedTeam: currentTeam,
                trueTeam: trueTeam,
                teamSwitched: false,
                message: `You appear to be an ${currentTeam.toUpperCase()}, but you're actually an ${trueTeam.toUpperCase()}!`,
            };
        },
        modifyWinCondition: async (lobbyId, players, votes, teams, db) => {
            const sleeperAgents = await db.all(
                "SELECT username, operation_info FROM players WHERE lobby_id = ? AND operation = 'sleeper agent'",
                [lobbyId]
            );
            for (const player of sleeperAgents) {
                if (!player.operation_info) continue;
                try {
                    const info = JSON.parse(player.operation_info);
                    if (!info.success || info.teamSwitched) continue;
                    await db.run(
                        "UPDATE players SET team = ? WHERE lobby_id = ? AND username = ?",
                        [info.trueTeam, lobbyId, player.username]
                    );
                    await db.run(
                        "UPDATE players SET operation_info = json_patch(operation_info, ?) WHERE lobby_id = ? AND username = ?",
                        [JSON.stringify({ teamSwitched: true }), lobbyId, player.username]
                    );
                    teams[player.username] = info.trueTeam;
                } catch (error) {
                    console.error(`Error processing sleeper agent operation for player ${player.username}:`, error);
                }
            }
        },
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
        modifyWinCondition: async () => {},
    },
    "danish intelligence": {
        fields: [],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const otherPlayers = players.filter(p => p !== self);
            const impostors = otherPlayers.filter(p => teams[p] === "impostor");
            const agents = otherPlayers.filter(p => teams[p] === "agent");
            if (impostors.length === 0 || agents.length === 0) {
                return {
                    success: false,
                    message: "Not enough players to generate intelligence information."
                };
            }
            const revealedImpostor = impostors[Math.floor(Math.random() * impostors.length)];
            const revealedAgent = agents[Math.floor(Math.random() * agents.length)];
            return {
                success: true,
                revealedImpostor,
                revealedAgent,
                message: `Your intelligence reveals that ${revealedImpostor} is an impostor and ${revealedAgent} is an agent.`
            };
        },
        modifyWinCondition: async () => {}
    },
    "confession": {
        fields: ["targetPlayer"],
        types: ["string"],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const possibleTargets = players.filter(p => p !== self);
            return {
                success: true,
                message: "Choose a player to confess your team allegiance to.",
                availablePlayers: possibleTargets,
                myTeam: teams[self]
            };
        },
        modifyWinCondition: async () => {}
    },
    "old photographs": {
        fields: [],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const otherPlayers = players.filter(p => p !== self);
            const teamGroups: Record<string, string[]> = {};
            otherPlayers.forEach(player => {
                const team = teams[player];
                if (!teamGroups[team]) {
                    teamGroups[team] = [];
                }
                teamGroups[team].push(player);
            });
            let selectedTeam: string | null = null;
            let selectedPlayers: string[] = [];
            for (const [team, teamMembers] of Object.entries(teamGroups)) {
                if (teamMembers.length >= 2) {
                    selectedTeam = team;
                    const shuffled = [...teamMembers].sort(() => Math.random() - 0.5);
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
        modifyWinCondition: async () => {}
    },
    "defector": {
        fields: ["targetPlayer"],
        types: ["string"],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const possibleTargets = players.filter(p => p !== self);
            return {
                success: true,
                message: "Choose a player to convert to the opposite team.",
                availablePlayers: possibleTargets
            };
        },
        modifyWinCondition: async (lobbyId, players, votes, teams, db) => {
            const defectorPlayers = await db.all(
                "SELECT username, operation_info FROM players WHERE lobby_id = ? AND operation = 'defector'",
                [lobbyId]
            );
            for (const player of defectorPlayers) {
                if (!player.operation_info) continue;
                try {
                    const info = JSON.parse(player.operation_info);
                    if (!info.targetPlayer || info.teamChanged) continue;
                    const targetPlayer = await db.get(
                        "SELECT team FROM players WHERE lobby_id = ? AND username = ?",
                        [lobbyId, info.targetPlayer]
                    );
                    if (!targetPlayer) continue;
                    const newTeam = targetPlayer.team === 'impostor' ? 'agent' : 'impostor';
                    await db.run(
                        "UPDATE players SET team = ? WHERE lobby_id = ? AND username = ?",
                        [newTeam, lobbyId, info.targetPlayer]
                    );
                    await db.run(
                        "UPDATE players SET operation_info = json_patch(operation_info, ?) WHERE lobby_id = ? AND username = ?",
                        [JSON.stringify({ teamChanged: true }), lobbyId, player.username]
                    );
                    teams[info.targetPlayer] = newTeam;
                } catch (error) {
                    console.error(`Error processing defector operation for player ${player.username}:`, error);
                }
            }
        }
    },
    // Placeholder for "scapegoat" if it's used from GAME_CONFIG.OPERATIONS
    "scapegoat": {
        fields: [], // Define fields if needed
        types: [],  // Define types if needed
        generateInfo: (players, teams, self) => {
            // Define how information is generated for the player
            return { message: "Scapegoat operation details not yet implemented." };
        },
        modifyWinCondition: async () => {
            // Define how this operation modifies win conditions, if at all
        }
    },
    // Placeholder for "secret intel" if it's used from GAME_CONFIG.OPERATIONS
    "secret intel": {
        fields: [], // Define fields if needed
        types: [],  // Define types if needed
        generateInfo: (players, teams, self) => {
            // Define how information is generated for the player
            return { message: "Secret Intel operation details not yet implemented." };
        },
        modifyWinCondition: async () => {
            // Define how this operation modifies win conditions, if at all
        }
    },
    // Placeholder for "secret tip" if it's used from GAME_CONFIG.OPERATIONS
    "secret tip": {
        fields: [], // Define fields if needed
        types: [],  // Define types if needed
        generateInfo: (players, teams, self) => {
            // Define how information is generated for the player
            return { message: "Secret Tip operation details not yet implemented." };
        },
        modifyWinCondition: async () => {
            // Define how this operation modifies win conditions, if at all
        }
    }
    // Ensure all operations listed in GAME_CONFIG.OPERATIONS have a corresponding entry here.
};
