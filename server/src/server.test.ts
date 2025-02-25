import request from "supertest";
import { app, initDB } from "../src/server"; // Adjust path based on your project structure

describe("Game Server API Endpoints", () => {
    beforeAll(async () => {
        await initDB(); // Ensure the database is initialized before running tests
    });

    it("should create a new lobby", async () => {
        const response = await request(app).post("/create-lobby").send();
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("lobbyId");
        expect(response.body).toHaveProperty("lobbyCode");
    });
});
