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
            clientSocket.on("player-joined", ({ username, team }) => {
                expect(username).toBe("testuser");
                expect(team).toBeDefined();
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
    

    afterAll(async () => {
        await stopServer();
    });
});
