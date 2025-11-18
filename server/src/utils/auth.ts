/**
 * Authentication utilities for Triple game
 * Handles JWT token generation and verification for lobby access
 */

interface LobbyAccessToken {
  lobbyId: string;
  username: string;
  lobbyCode: string;
  iat: number; // issued at
  exp: number; // expiration time
}

const JWT_SECRET = process.env.JWT_SECRET || "triple-game-secret-key-change-in-production";
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Simple JWT implementation (encode/decode without external library)
 * Note: For production, use jsonwebtoken package
 */

/**
 * Encodes a token (base64-based simple JWT)
 * @param payload - Token payload
 * @param secret - Secret key for signing
 * @returns Encoded token
 */
export const encodeToken = (payload: LobbyAccessToken, secret: string = JWT_SECRET): string => {
  // Simple base64 encoding (NOT cryptographically secure)
  // For production use proper JWT library with RS256
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const signature = btoa(secret + payload.lobbyId + payload.username);
  return `${header}.${body}.${signature}`;
};

/**
 * Decodes and validates a token
 * @param token - Token to decode
 * @param secret - Secret key for verification
 * @returns Decoded payload or null if invalid
 */
export const decodeToken = (token: string, secret: string = JWT_SECRET): LobbyAccessToken | null => {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1])) as LobbyAccessToken;

    // Check expiration
    if (payload.exp < Date.now()) {
      return null;
    }

    // Verify signature (simple check - not cryptographically secure)
    const expectedSignature = btoa(secret + payload.lobbyId + payload.username);
    if (parts[2] !== expectedSignature) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error("Token decode error:", error);
    return null;
  }
};

/**
 * Generates a lobby access token
 * @param lobbyId - Lobby identifier
 * @param username - Player username
 * @param lobbyCode - Lobby code
 * @returns Access token
 */
export const generateLobbyToken = (lobbyId: string, username: string, lobbyCode: string): string => {
  const now = Date.now();
  const payload: LobbyAccessToken = {
    lobbyId,
    username,
    lobbyCode,
    iat: now,
    exp: now + TOKEN_EXPIRY_MS,
  };
  return encodeToken(payload);
};

/**
 * Verifies a lobby access token
 * @param token - Token to verify
 * @param expectedLobbyId - Expected lobby ID
 * @param expectedUsername - Expected username
 * @returns true if token is valid and matches expected values
 */
export const verifyLobbyToken = (
  token: string,
  expectedLobbyId: string,
  expectedUsername: string
): boolean => {
  const payload = decodeToken(token);

  if (!payload) {
    return false;
  }

  // Verify token matches expected lobby and username
  return payload.lobbyId === expectedLobbyId && payload.username === expectedUsername;
};
