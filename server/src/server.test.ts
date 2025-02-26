import request from "supertest";
import { io as Client } from "socket.io-client";
import { app, startServer, stopServer } from "../src/server";
import { getDB } from "../src/db/db";

jest.setTimeout(3000); // Set timeout to 3 seconds

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
            // Step 1: Create a new lobby
            const createLobbyResponse = await request(app)
                .post("/create-lobby")
                .send({ username: "creator" });
    
            expect(createLobbyResponse.status).toBe(200);
            expect(createLobbyResponse.body).toHaveProperty("lobbyCode");
    
            const { lobbyCode } = createLobbyResponse.body;
    
            // Step 2: Join the lobby with another player
            clientSocket.emit("join-lobby", { username: "testuser", lobbyCode });
    
            // Step 3: Listen for the 'player-joined' event
            clientSocket.on("player-joined", ({ username }) => {
                expect(username).toBe("testuser");
                clientSocket.disconnect();
                done();
            });
    
            // Step 4: Handle potential errors
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
            // Step 1: Attempt to join a non-existent lobby
            clientSocket.emit("join-lobby", { username: "testuser", lobbyCode: "nonexistent" });

            // Step 2: Listen for the 'error' event
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
            // Step 1: Create a new lobby
            const createLobbyResponse = await request(app)
                .post("/create-lobby")
                .send({ username: "creator" });

            expect(createLobbyResponse.status).toBe(200);
            expect(createLobbyResponse.body).toHaveProperty("lobbyCode");

            const { lobbyCode } = createLobbyResponse.body;

            // Step 2: Join the lobby with 4 more players
            const clientSocket2 = Client("http://localhost:5000");
            const clientSocket3 = Client("http://localhost:5000");
            const clientSocket4 = Client("http://localhost:5000");
            const clientSocket5 = Client("http://localhost:5000");
            
            let playersJoined = 0;
            const checkPlayersJoined = () => {
                playersJoined++;
                if (playersJoined === 5) {
                    clientSocket1.emit("start-game", { lobbyCode });
                }
            }

            clientSocket1.emit("join-lobby", { username: "testuser1", lobbyCode });
            clientSocket1.on("player-joined", checkPlayersJoined);

            clientSocket2.emit("join-lobby", { username: "testuser2", lobbyCode });
            clientSocket2.on("player-joined", checkPlayersJoined);

            clientSocket3.emit("join-lobby", { username: "testuser3", lobbyCode });
            clientSocket3.on("player-joined", checkPlayersJoined);

            clientSocket4.emit("join-lobby", { username: "testuser4", lobbyCode });
            clientSocket4.on("player-joined", checkPlayersJoined);

            clientSocket5.emit("join-lobby", { username: "testuser5", lobbyCode });
            clientSocket5.on("player-joined", checkPlayersJoined);

            // Step 3: Listen for the 'game-started' event
            clientSocket1.on("game-started", ({ impostors }) => {
                expect(impostors).toHaveLength(2);
                clientSocket1.disconnect();
                clientSocket2.disconnect();
                clientSocket3.disconnect();
                clientSocket4.disconnect();
                clientSocket5.disconnect();
                done();
            });

            // Step 9: Handle potential errors
            clientSocket1.on("error", (message) => {
                clientSocket1.disconnect();
                done.fail(new Error(message));
            });
        });
    });
    

    afterAll(async () => {
        await stopServer();
    });
});
