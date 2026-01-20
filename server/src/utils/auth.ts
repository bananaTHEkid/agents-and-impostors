/**
 * Authentication utilities for Triple game
 * Secure JWT token generation and verification for lobby access
 */
import jwt from 'jsonwebtoken';

interface LobbyAccessToken {
  lobbyId: string;
  username: string;
  lobbyCode: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'triple-game-secret-key-change-in-production';
const TOKEN_EXPIRY = '24h';

/**
 * Generates a signed JWT for lobby access
 */
export const generateLobbyToken = (lobbyId: string, username: string, lobbyCode: string): string => {
  const payload: LobbyAccessToken = { lobbyId, username, lobbyCode };
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: TOKEN_EXPIRY });
};

/**
 * Verifies a JWT and ensures it matches expected lobby/username
 */
export const verifyLobbyToken = (token: string, expectedLobbyId: string, expectedUsername: string): boolean => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as LobbyAccessToken & jwt.JwtPayload;
    return decoded.lobbyId === expectedLobbyId && decoded.username === expectedUsername;
  } catch (err) {
    return false;
  }
};
