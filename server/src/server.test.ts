import request from "supertest";
import { io as Client, Socket } from "socket.io-client";
import { app, startServer, stopServer , calculateWinConditions} from "../src/server";
import { getDB } from "../src/db/db";
import { DefaultEventsMap } from "@socket.io/component-emitter";

jest.setTimeout(3000); // Set timeout to 30 seconds

describe("Game Server API Endpoints (In-Memory)", () => {
    beforeAll(async () => {
        await startServer(true); // Use in-memory DB
    });

    beforeEach(async () => {
        const db = getDB();
        await db.exec("DELETE FROM players");
        await db.exec("DELETE FROM lobbies");
    });

    it("should create a new lobby", async () => {
        const response = await request(app).post("/create-lobby").send({ username: "creator" });
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("lobbyId");
        expect(response.body).toHaveProperty("lobbyCode");
    });

    it("should add a player to a lobby on creation", async () => {
        const response = await request(app).post("/create-lobby").send({ username: "creator" });
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("lobbyId");
        expect(response.body).toHaveProperty("lobbyCode");

        const db = getDB();
        const player = await db.get("SELECT * FROM players WHERE username = ?", ["creator"]);
        expect(player).toBeDefined();
    });

    it("should allow a player to join an existing lobby", (done) => {
        const clientSocket = Client("http://localhost:5000");

        clientSocket.on("connect", async () => {
            // Create a new lobby first
            const createLobbyResponse = await request(app)
                .post("/create-lobby")
                .send({ username: "creator" });

            expect(createLobbyResponse.status).toBe(200);
            expect(createLobbyResponse.body).toHaveProperty("lobbyCode");

            const { lobbyCode } = createLobbyResponse.body;

            // Join the lobby with another player
            clientSocket.emit("join-lobby", { username: "testuser", lobbyCode });

            // Listen for the 'player-joined' event
            clientSocket.on("player-joined", ({ username }) => {
                expect(username).toBe("testuser");
                clientSocket.disconnect();
                done();
            });

            // Handle potential errors
            clientSocket.on("error", (message) => {
                clientSocket.disconnect();
                done.fail(new Error(message));
            });
        });

        clientSocket.on("connect_error", (err) => {
            console.error("Connection error:", err);
            done.fail(new Error("Connection error"));
        });

        clientSocket.on("disconnect", (reason) => {
            console.log("Client disconnected:", reason);
        });
    });

    it("should not allow a player to join a non-existent lobby", (done) => {
        const clientSocket = Client("http://localhost:5000");

        clientSocket.on("connect", async () => {
            // Attempt to join a non-existent lobby
            clientSocket.emit("join-lobby", { username: "testuser", lobbyCode: "nonexistent" });

            // Listen for the 'error' event
            clientSocket.on("error", (message) => {
                expect(message).toBe("Lobby does not exist");
                clientSocket.disconnect();
                done();
            });
        });
    });

    it("should start a game when all players are ready, 5 players", (done) => {
        const clientSocket1 = Client("http://localhost:5000");
    
        clientSocket1.on("connect", async () => {
            // Create a new lobby
            const createLobbyResponse = await request(app)
                .post("/create-lobby")
                .send({ username: "creator" });
    
            expect(createLobbyResponse.status).toBe(200);
            expect(createLobbyResponse.body).toHaveProperty("lobbyCode");
    
            const { lobbyCode } = createLobbyResponse.body;
    
            // Join the lobby with 4 more players
            const sockets: Socket<DefaultEventsMap, DefaultEventsMap>[] = [];
            for (let i = 2; i <= 5; i++) {
                const socket = Client("http://localhost:5000");
                sockets.push(socket);
                socket.emit("join-lobby", { username: `testuser${i}`, lobbyCode });
            }
    
            let playersJoined = 0;
            const checkPlayersJoined = () => {
                playersJoined++;
                if (playersJoined === 5) {
                    clientSocket1.emit("start-game", { lobbyCode });
                }
            };
    
            clientSocket1.emit("join-lobby", { username: "testuser1", lobbyCode });
            clientSocket1.on("player-joined", checkPlayersJoined);
            sockets.forEach(socket => socket.on("player-joined", checkPlayersJoined));
    
            // Listen for 'team-assignment' instead of 'game-started'
            clientSocket1.on("team-assignment", ({ impostors }) => {
                expect(impostors.length).toBe(2);
            });
    
            // Wait for 'operation-phase-complete' before finishing the test
            clientSocket1.on("operation-phase-complete", () => {
                sockets.forEach(socket => socket.disconnect());
                clientSocket1.disconnect();
                done();
            });
    
            // Handle potential errors
            clientSocket1.on("error", (message) => {
                done.fail(new Error(message));
            });
        });
    
        clientSocket1.on("connect_error", (err) => {
            done.fail(new Error("Connection error"));
        });
    });

    it("should properly determine winners based on voting and special operations", (done) => {
        const clientSocket1 = Client("http://localhost:5000");
    
        clientSocket1.on("connect", async () => {
            // Create a new lobby
            const createLobbyResponse = await request(app)
                .post("/create-lobby")
                .send({ username: "creator" });
    
            expect(createLobbyResponse.status).toBe(200);
            const { lobbyCode } = createLobbyResponse.body;
    
            // Join with 4 more players
            const sockets: Socket<DefaultEventsMap, DefaultEventsMap>[] = [];
            const players = ["player1", "player2", "player3", "player4"];
            
            for (let i = 0; i < players.length; i++) {
                const socket = Client("http://localhost:5000");
                sockets.push(socket);
                socket.emit("join-lobby", { username: players[i], lobbyCode });
            }
    
            // Wait for all players to join
            let playersJoined = 0;
            const checkPlayersJoined = () => {
                playersJoined++;
                if (playersJoined === players.length) {
                    // Start the game
                    clientSocket1.emit("start-game", { lobbyCode });
                }
            };
    
            clientSocket1.on("player-joined", checkPlayersJoined);
            sockets.forEach(socket => {
                socket.on("player-joined", checkPlayersJoined);
            });
    
            // Game start phases
            clientSocket1.on("team-assignment", async ({ impostors }) => {
                // Manually set player operations for testing win conditions
                const db = getDB();
                
                // Insert special operations for testing
                await db.run("UPDATE players SET operation = ? WHERE username = ?", ["grudge", "player1"]);
                await db.run("UPDATE players SET operation = ? WHERE username = ?", ["infatuation", "player2"]);
                await db.run("UPDATE players SET operation = ? WHERE username = ?", ["sleeper agent", "player3"]);
                await db.run("UPDATE players SET operation = ? WHERE username = ?", ["scapegoat", "player4"]);
                
                // Set operation_info
                await db.run(
                    "UPDATE players SET operation_info = ? WHERE username = ?", 
                    [JSON.stringify({ targetPlayer: "player4" }), "player1"]
                );
                await db.run(
                    "UPDATE players SET operation_info = ? WHERE username = ?", 
                    [JSON.stringify({ targetPlayer: "player3" }), "player2"]
                );
            });
    
            // After operation phase completes, submit votes
            clientSocket1.on("operation-phase-complete", async () => {
                const db = getDB();
                const lobbyId = await db.get("SELECT id FROM lobbies WHERE lobby_code = ?", [lobbyCode]);
                
                // Create a specific voting scenario
                const votes: Record<string, string> = {
                    "creator": "player4",
                    "player1": "player4",
                    "player2": "player3",
                    "player3": "player1",
                    "player4": "player2"
                };
                
                // Submit votes
                await calculateWinConditions(lobbyId.id, votes);
            });
    
            // Check game results
            clientSocket1.on("game-results", ({ results, mostVotedPlayer }) => {
                try {
                    // Verify that most voted player is correct
                    expect(mostVotedPlayer).toBe("player4");
                    
                    // Find specific players and check their win status
                    const player1 = results.find(p => p.username === "player1");
                    const player2 = results.find(p => p.username === "player2");
                    const player3 = results.find(p => p.username === "player3");
                    const player4 = results.find(p => p.username === "player4");
                    
                    // Check specific win conditions based on operations
                    if (player4.team === "agent") {
                        // If player4 (scapegoat) is an agent, impostors should win
                        expect(results.filter(p => p.team === "impostor" && p.operation !== "sleeper agent")
                            .every(p => p.win_status === "won")).toBe(true);
                            
                        // Player1 (grudge) should win if their target was eliminated
                        expect(player1.win_status).toBe("won");
                        
                        // Player4 (scapegoat) should win because they were eliminated
                        expect(player4.win_status).toBe("won");
                    }
                    
                    // Disconnect all sockets
                    sockets.forEach(socket => socket.disconnect());
                    clientSocket1.disconnect();
                    done();
                } catch (error) {
                    done(error);
                }
            });
    
            // Handle errors
            clientSocket1.on("error", (message) => {
                done(new Error(message));
            });
        });
    
        clientSocket1.on("connect_error", (err) => {
            done(new Error("Connection error"));
        });
    });



    afterAll(async () => {
        await stopServer();
    });
});