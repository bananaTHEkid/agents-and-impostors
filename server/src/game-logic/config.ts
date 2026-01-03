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
        {name: "grudge", hidden: true, clientChooses: false},
        {name: "infatuation", hidden: true, clientChooses: false},
        {name: "scapegoat", hidden: true, clientChooses: false},
        {name: "sleeper agent", hidden: true, clientChooses: false},
        {name: "secret intel", hidden: false, clientChooses: false},
        {name: "secret tip", hidden: true, clientChooses: false},
        {name: "confession", hidden: false, clientChooses: true},
        {name: "old photographs", hidden: false, clientChooses: false},
        {name: "danish intelligence", hidden: false, clientChooses: true},
        {name: "anonymous tip", hidden: false, clientChooses: false},
        {name: "unfortunate encounter", hidden: false, clientChooses: true},
        {name: "spy transfer", hidden: false, clientChooses: true}
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
                return { message: "Dein Groll-Ziel konnte wegen fehlender Teaminformation nicht ermittelt werden." };
            }
            const opponents = players.filter(p => p !== self && teams[p] && teams[p] !== selfTeam);
            if (opponents.length === 0) {
                return { message: "Es konnte kein Groll-Ziel aus gegnerischen Teams ermittelt werden." };
            }
            const randomOpponent = opponents[Math.floor(Math.random() * opponents.length)];
            return {
                grudgeTarget: randomOpponent,
                message: `Du hegst einen Groll gegen ${randomOpponent}. Richte deine Verdachtsmomente oder Aktionen bevorzugt auf diese Person.`
            };
        },
        modifyWinCondition: async (lobbyId, players, votes, teams, db, roundResult) => {
            try {
                const grudgePlayers = await db.all(
                    "SELECT username, operation_info FROM players WHERE lobby_id = ? AND operation = 'grudge'",
                    [lobbyId]
                );

                // Determine eliminated players from roundResult if available, else query DB
                let eliminatedNames: string[] = [];
                if (roundResult && Array.isArray(roundResult.eliminatedPlayers)) {
                    eliminatedNames = roundResult.eliminatedPlayers;
                } else {
                    const eliminatedRows = await db.all(
                        "SELECT username FROM players WHERE lobby_id = ? AND eliminated = 1",
                        [lobbyId]
                    );
                    eliminatedNames = eliminatedRows.map((r: any) => r.username);
                }

                for (const player of grudgePlayers) {
                    if (!player.operation_info) continue;
                    try {
                        const info = JSON.parse(player.operation_info);
                        const target = info?.grudgeTarget || info?.revealedPlayer || null;
                        if (!target) continue;

                        const targetWasEliminated = eliminatedNames.includes(target);
                        if (targetWasEliminated) {
                            // Mark the grudge-holder as a winner
                            await db.run(
                                "UPDATE players SET win_status = ? WHERE lobby_id = ? AND username = ?",
                                ['win', lobbyId, player.username]
                            );
                            // Mark operation as processed to avoid double application
                            await db.run(
                                "UPDATE players SET operation_info = json_patch(operation_info, ?) WHERE lobby_id = ? AND username = ?",
                                [JSON.stringify({ grudgeTriggered: true }), lobbyId, player.username]
                            );
                        }
                    } catch (err) {
                        console.error(`Fehler bei der Verarbeitung von 'Groll' für Spieler ${player.username}:`, err);
                    }
                }
            } catch (error) {
                console.error('Fehler in grudge.modifyWinCondition:', error);
            }
        },
    },
    "infatuation": {
        fields: [],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const otherPlayers = players.filter(p => p !== self);
            if (otherPlayers.length === 0) {
                return {
                    message: "Kein gültiges Ziel für Verliebtheit gefunden.",
                    success: false
                };
            }
            const infatuationTarget = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
            return {
                infatuationTarget,
                targetTeam: teams[infatuationTarget],
                message: `Du bist verliebt in ${infatuationTarget}. Dein Schicksal ist an diese Person gebunden — du gewinnst nur, wenn sie gewinnt!`,
                success: true
            };
        },
        modifyWinCondition: async (lobbyId, players, votes, teams, db, roundResult) => {
            // Prefer the provided roundResult to determine outcomes when possible.
            // However, if a target player's win_status was explicitly set by
            // earlier priority operations (e.g. scapegoat, grudge), honor that DB value.
            const infatuatedPlayers = await db.all(
                "SELECT username, operation_info FROM players WHERE lobby_id = ? AND operation = 'infatuation'",
                [lobbyId]
            );
            for (const player of infatuatedPlayers) {
                if (!player.operation_info) continue;
                try {
                    const info = JSON.parse(player.operation_info);
                    if (!info.success || !info.infatuationTarget) continue;
                    const target = info.infatuationTarget;

                    // Check if the target has an explicit win_status set in DB (priority ops may have set this)
                    const targetRow: any = await db.get(
                        "SELECT win_status, team FROM players WHERE lobby_id = ? AND username = ?",
                        [lobbyId, target]
                    );

                    let targetWinStatus: 'win' | 'lose' = 'lose';

                    if (targetRow && targetRow.win_status) {
                        // Honor explicit DB win_status when present
                        targetWinStatus = targetRow.win_status;
                    } else if (roundResult) {
                        // Derive target's win status from the roundResult winner and their team
                        // If target's team matches the roundResult winner, they are considered a winner
                        const targetTeam = (targetRow && targetRow.team) ? targetRow.team : teams[target];
                        if (targetTeam && roundResult.winner === targetTeam) {
                            targetWinStatus = 'win';
                        } else {
                            targetWinStatus = 'lose';
                        }
                    } else {
                        // Fallback: if neither DB nor roundResult available, default to 'lose'
                        targetWinStatus = 'lose';
                    }

                    await db.run(
                        "UPDATE players SET win_status = ? WHERE lobby_id = ? AND username = ?",
                        [targetWinStatus, lobbyId, player.username]
                    );
                } catch (error) {
                    console.error(`Fehler bei der Verarbeitung von 'Verliebtheit' für Spieler ${player.username}:`, error);
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
                    message: "Dein aktuelles Team konnte nicht bestimmt werden.",
                };
            }
            const trueTeam = currentTeam === "agent" ? "impostor" : "agent";
            return {
                success: true,
                displayedTeam: currentTeam,
                trueTeam: trueTeam,
                teamSwitched: false,
                message: `Du scheinst ein ${currentTeam === 'impostor' ? 'Hochstapler' : 'Agent'} zu sein, bist in Wahrheit jedoch ein ${trueTeam === 'impostor' ? 'Hochstapler' : 'Agent'}!`,
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
                    console.error(`Fehler bei der Verarbeitung von 'Schläferagent' für Spieler ${player.username}:`, error);
                }
            }
        },
    },
    "anonymous tip": {
        fields: [],
        types: [],
        generateInfo: (players, teams, self) => {
            const otherPlayers = players.filter(p => p !== self);
            if (otherPlayers.length === 0) return null;
            const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
            return { revealedPlayer: randomPlayer, team: teams[randomPlayer], message: `Du hast einen anonymen Hinweis erhalten: ${randomPlayer} ist ein ${teams[randomPlayer] === 'impostor' ? 'Hochstapler' : 'Agent'}.` };
        },
        modifyWinCondition: async (lobbyId, players, votes, teams, db) => {
            try {
                const tipPlayers = await db.all(
                    "SELECT username, operation_info FROM players WHERE lobby_id = ? AND operation = 'anonymous tip'",
                    [lobbyId]
                );
                for (const player of tipPlayers) {
                    if (!player.operation_info) continue;
                    try {
                        const info = JSON.parse(player.operation_info);
                        // Ensure the info indicates it was delivered (non-hidden)
                        if (!info.revealed) {
                            info.revealed = true;
                            await db.run(
                                "UPDATE players SET operation_info = ? WHERE lobby_id = ? AND username = ?",
                                [JSON.stringify(info), lobbyId, player.username]
                            );
                        }
                    } catch (err) {
                        console.error(`Fehler bei der Verarbeitung von 'Anonymer Hinweis' für Spieler ${player.username}:`, err);
                    }
                }
            } catch (error) {
                console.error('Fehler in anonymous tip.modifyWinCondition:', error);
            }
        },
    },
    "danish intelligence": {
        fields: [],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const otherPlayers = players.filter(p => p !== self);
            return {
                success: true,
                message: "Wähle zwei Spieler für eine Untersuchung mit dem dänischen Geheimdienst.",
                availablePlayers: otherPlayers
            };
        },
        modifyWinCondition: async (lobbyId, players, votes, teams, db) => {
            try {
                const intelPlayers = await db.all(
                    "SELECT username, operation_info FROM players WHERE lobby_id = ? AND operation = 'danish intelligence'",
                    [lobbyId]
                );
                for (const player of intelPlayers) {
                    if (!player.operation_info) continue;
                    try {
                        const info = JSON.parse(player.operation_info);
                        if (!info.targetPlayer1 || !info.targetPlayer2) continue;

                        const target1 = await db.get(
                            "SELECT team FROM players WHERE lobby_id = ? AND username = ?",
                            [lobbyId, info.targetPlayer1]
                        );
                        const target2 = await db.get(
                            "SELECT team FROM players WHERE lobby_id = ? AND username = ?",
                            [lobbyId, info.targetPlayer2]
                        );

                        if (!target1 || !target2) continue;

                        // Determine revelation: reveal all if one or both are impostors, or if both are agents
                        const oneOrBothImpostors = target1.team === 'impostor' || target2.team === 'impostor';
                        const bothAgents = target1.team === 'agent' && target2.team === 'agent';
                        const shouldReveal = oneOrBothImpostors || bothAgents;

                        if (shouldReveal) {
                            const msg = oneOrBothImpostors
                                ? `Von ${info.targetPlayer1} und ${info.targetPlayer2} ist mindestens einer ein Hochstapler.`
                                : `${info.targetPlayer1} und ${info.targetPlayer2} sind beide Agenten.`;
                            info.revealed = {
                                target1Name: info.targetPlayer1,
                                target1Team: target1.team,
                                target2Name: info.targetPlayer2,
                                target2Team: target2.team,
                                message: msg
                            };
                        } else {
                            info.revealed = {
                                message: "Einer ist ein Hochstapler und einer ein Agent (keine Offenlegung)"
                            };
                        }

                        await db.run(
                            "UPDATE players SET operation_info = ? WHERE lobby_id = ? AND username = ?",
                            [JSON.stringify(info), lobbyId, player.username]
                        );
                    } catch (err) {
                        console.error(`Fehler bei der Verarbeitung von 'Dänischer Geheimdienst' für Spieler ${player.username}:`, err);
                    }
                }
            } catch (error) {
                console.error('Fehler in danish intelligence.modifyWinCondition:', error);
            }
        }
    },
    "confession": {
        fields: [],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const possibleTargets = players.filter(p => p !== self);
            return {
                success: true,
                message: "Wähle einen Spieler, dem du deine Teamzugehörigkeit beichtest.",
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
                    message: "Nicht genügend Spieler im selben Team, um Fotografien zu erstellen."
                };
            }
            return {
                success: true,
                revealedPlayers: selectedPlayers,
                message: `Deine alten Fotografien zeigen, dass ${selectedPlayers[0]} und ${selectedPlayers[1]} im selben Team sind.`
            };
        },
        modifyWinCondition: async (lobbyId, players, votes, teams, db) => {
            try {
                const photoPlayers = await db.all(
                    "SELECT username, operation_info FROM players WHERE lobby_id = ? AND operation = 'old photographs'",
                    [lobbyId]
                );
                for (const player of photoPlayers) {
                    if (!player.operation_info) continue;
                    try {
                        const info = JSON.parse(player.operation_info);
                        if (!info.revealed) {
                            info.revealed = true;
                            await db.run(
                                "UPDATE players SET operation_info = ? WHERE lobby_id = ? AND username = ?",
                                [JSON.stringify(info), lobbyId, player.username]
                            );
                        }
                    } catch (err) {
                        console.error(`Fehler bei der Verarbeitung von 'Alte Fotografien' für Spieler ${player.username}:`, err);
                    }
                }
            } catch (error) {
                console.error('Fehler in old photographs.modifyWinCondition:', error);
            }
        }
    },
    "defector": {
        fields: [],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const possibleTargets = players.filter(p => p !== self);
            return {
                success: true,
                message: "Wähle einen Spieler, den du zum gegnerischen Team überlaufen lässt.",
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
                    console.error(`Fehler bei der Verarbeitung von 'Überläufer' für Spieler ${player.username}:`, error);
                }
            }
        }
    },
    // SCAPEGOAT: Player wins only if voted out
    "scapegoat": {
        fields: [],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            return {
                success: true,
                message: "Du bist der Sündenbock. Du gewinnst nur, wenn du herausgewählt wirst!",
                winCondition: "must_be_voted_out"
            };
        },
        modifyWinCondition: async (lobbyId, players, votes, teams, db, roundResult) => {
            // Get scapegoat players
            const scapegoats = await db.all(
                "SELECT username FROM players WHERE lobby_id = ? AND operation = 'scapegoat'",
                [lobbyId]
            );

            // Determine eliminated players from provided roundResult (preferred) or fallback to DB
            let eliminatedNames: string[] = [];
            if (roundResult && Array.isArray((roundResult as any).eliminatedPlayers)) {
                eliminatedNames = (roundResult as any).eliminatedPlayers;
            } else {
                const eliminated = await db.all(
                    "SELECT username FROM players WHERE lobby_id = ? AND eliminated = 1",
                    [lobbyId]
                );
                eliminatedNames = eliminated.map((p: any) => p.username);
            }

            for (const scapegoat of scapegoats) {
                const isEliminated = eliminatedNames.includes(scapegoat.username);
                const shouldWin = isEliminated; // Win condition is being voted out

                await db.run(
                    "UPDATE players SET win_status = ? WHERE lobby_id = ? AND username = ?",
                    [shouldWin ? 'win' : 'lose', lobbyId, scapegoat.username]
                );
            }
        }
    },
    // SECRET INTEL: Server chooses 2 names. If one or both are impostors, revealed. If both are agents, revealed.
    "secret intel": {
        fields: [],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const otherPlayers = players.filter(p => p !== self);
            if (otherPlayers.length < 2) {
                return {
                    success: false,
                    message: "Nicht genügend Spieler für geheime Informationen."
                };
            }
            // Pick two random distinct players (excluding self)
            const shuffled = [...otherPlayers].sort(() => Math.random() - 0.5);
            const picked = shuffled.slice(0, 2);
            return {
                success: true,
                message: "Deine geheimen Informationen enthüllen Hinweise über zwei Spieler.",
                targetPlayer1: picked[0],
                targetPlayer2: picked[1]
            };
        },
        modifyWinCondition: async (lobbyId, players, votes, teams, db) => {
            const intelPlayers = await db.all(
                "SELECT username, operation_info FROM players WHERE lobby_id = ? AND operation = 'secret intel'",
                [lobbyId]
            );
            
            for (const player of intelPlayers) {
                if (!player.operation_info) continue;
                try {
                    const info = JSON.parse(player.operation_info);
                    if (!info.targetPlayer1 || !info.targetPlayer2) continue;
                    
                    const target1 = await db.get(
                        "SELECT team FROM players WHERE lobby_id = ? AND username = ?",
                        [lobbyId, info.targetPlayer1]
                    );
                    const target2 = await db.get(
                        "SELECT team FROM players WHERE lobby_id = ? AND username = ?",
                        [lobbyId, info.targetPlayer2]
                    );
                    
                    if (!target1 || !target2) continue;
                    // Mirror danish intelligence: reveal if one or more impostors OR both agents
                    const oneOrBothImpostors = target1.team === 'impostor' || target2.team === 'impostor';
                    const bothAgents = target1.team === 'agent' && target2.team === 'agent';
                    const shouldReveal = oneOrBothImpostors || bothAgents;

                    if (shouldReveal) {
                            const msg = oneOrBothImpostors
                                ? `Von ${info.targetPlayer1} und ${info.targetPlayer2} ist mindestens einer ein Hochstapler.`
                                : `${info.targetPlayer1} und ${info.targetPlayer2} sind beide Agenten.`;
                        info.revealed = {
                            target1Name: info.targetPlayer1,
                            target1Team: target1.team,
                            target2Name: info.targetPlayer2,
                            target2Team: target2.team,
                            message: msg
                        };
                    } else {
                        info.revealed = {
                            message: "Einer ist ein Hochstapler und einer ein Agent (keine Offenlegung)"
                        };
                    }
                    
                    await db.run(
                        "UPDATE players SET operation_info = ? WHERE lobby_id = ? AND username = ?",
                        [JSON.stringify(info), lobbyId, player.username]
                    );
                } catch (error) {
                    console.error(`Fehler bei der Verarbeitung von 'Geheime Informationen' für Spieler ${player.username}:`, error);
                }
            }
        }
    },
    // UNFORTUNATE ENCOUNTER: Player chooses another; both receive same message summary
    "unfortunate encounter": {
        fields: ["targetPlayer"],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const possibleTargets = players.filter(p => p !== self);
            return {
                success: true,
                message: "Wähle einen Spieler für eine unglückliche Begegnung.",
                availablePlayers: possibleTargets
            };
        },
        // No win condition changes; messaging handled at operation time
        modifyWinCondition: async () => {}
    },
    // SPY TRANSFER: Player chooses another; emitter changes to target's team (no swap)
    "spy transfer": {
        fields: ["targetPlayer"],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const possibleTargets = players.filter(p => p !== self);
            return {
                success: true,
                message: "Wähle einen Spieler; du wechselst heimlich in dessen Team.",
                availablePlayers: possibleTargets
            };
        },
        modifyWinCondition: async (lobbyId, players, votes, teams, db) => {
            const transferPlayers = await db.all(
                "SELECT username, operation_info FROM players WHERE lobby_id = ? AND operation = 'spy transfer'",
                [lobbyId]
            );
            for (const player of transferPlayers) {
                if (!player.operation_info) continue;
                try {
                    const info = JSON.parse(player.operation_info);
                    const target = info?.targetPlayer;
                    if (!target || info?.transferApplied) continue;

                    const emitterRow = await db.get(
                        "SELECT team FROM players WHERE lobby_id = ? AND username = ?",
                        [lobbyId, player.username]
                    );
                    const targetRow = await db.get(
                        "SELECT team FROM players WHERE lobby_id = ? AND username = ?",
                        [lobbyId, target]
                    );
                    if (!emitterRow || !targetRow) continue;

                    // Change emitter's team to the target's team; do not modify target's team
                    await db.run(
                        "UPDATE players SET team = ? WHERE lobby_id = ? AND username = ?",
                        [targetRow.team, lobbyId, player.username]
                    );

                    // Mark applied and update in-memory map
                    await db.run(
                        "UPDATE players SET operation_info = json_patch(operation_info, ?) WHERE lobby_id = ? AND username = ?",
                        [JSON.stringify({ transferApplied: true }), lobbyId, player.username]
                    );
                    teams[player.username] = targetRow.team;
                } catch (err) {
                    console.error(`Fehler bei der Verarbeitung von 'Agentenübertragung' für Spieler ${player.username}:`, err);
                }
            }
        }
    },
    // SECRET TIP: Given one name and their association
    "secret tip": {
        fields: [],
        types: [],
        generateInfo: (players: string[], teams: Record<string, string>, self: string) => {
            const otherPlayers = players.filter(p => p !== self);
            if (otherPlayers.length === 0) {
                return {
                    success: false,
                    message: "Keine anderen Spieler verfügbar für geheimen Hinweis."
                };
            }
            // Pick a random other player and reveal their association
            const randomTarget = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
            const targetTeam = teams[randomTarget];
            
            return {
                success: true,
                tippedPlayerName: randomTarget,
                tippedPlayerAssociation: targetTeam,
                message: `Du hast einen geheimen Hinweis erhalten: ${randomTarget} ist ein ${targetTeam === 'impostor' ? 'Hochstapler' : 'Agent'}!`
            };
        },
        modifyWinCondition: async () => {
            // Secret tip doesn't modify win conditions
        }
    }
    // Ensure all operations listed in GAME_CONFIG.OPERATIONS have a corresponding entry here.
};
