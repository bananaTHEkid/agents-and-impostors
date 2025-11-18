/**
 * Input validation and sanitization utilities for Triple game
 */

/**
 * Validates username format
 * Requirements: 2-20 characters, alphanumeric and underscores only
 * @param username - Username to validate
 * @returns true if valid, false otherwise
 */
export const validateUsername = (username: string): boolean => {
  if (!username || typeof username !== "string") {
    return false;
  }
  const trimmed = username.trim();
  return trimmed.length >= 2 && trimmed.length <= 20 && /^[a-zA-Z0-9_]+$/.test(trimmed);
};

/**
 * Validates lobby code format
 * Requirements: Must be exactly 6 uppercase alphanumeric characters
 * @param code - Lobby code to validate
 * @returns true if valid, false otherwise
 */
export const validateLobbyCode = (code: string): boolean => {
  if (!code || typeof code !== "string") {
    return false;
  }
  return /^[A-Z0-9]{6}$/.test(code.trim().toUpperCase());
};

/**
 * Sanitizes operation data to prevent XSS attacks
 * Escapes special HTML characters
 * @param data - Operation data object to sanitize
 * @returns Sanitized data object
 */
export const sanitizeOperation = (data: Record<string, any>): Record<string, any> => {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      // Escape HTML special characters
      sanitized[key] = escapeHtml(value);
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeOperation(value);
    } else if (Array.isArray(value)) {
      // Sanitize array elements
      sanitized[key] = value.map((item) =>
        typeof item === "string" ? escapeHtml(item) : item
      );
    } else {
      // Keep primitive values as-is (numbers, booleans, null, undefined)
      sanitized[key] = value;
    }
  }

  return sanitized;
};

/**
 * Escapes HTML special characters to prevent XSS
 * @param str - String to escape
 * @returns Escaped string
 */
const escapeHtml = (str: string): string => {
  const htmlEscapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return str.replace(/[&<>"']/g, (char) => htmlEscapeMap[char] || char);
};

/**
 * Validates that an operation hasn't already been assigned and accepted
 * Checks operation_accepted flag in player record
 * @param operationAccepted - Whether operation was already accepted (1 or 0)
 * @returns true if operation can be assigned (not already accepted), false otherwise
 */
export const validateOperationNotUsed = (operationAccepted: number): boolean => {
  return operationAccepted === 0;
};

/**
 * Validates operation type against known operations
 * @param operation - Operation type to validate
 * @param knownOperations - Array or set of valid operation types
 * @returns true if operation is valid, false otherwise
 */
export const validateOperationType = (
  operation: string,
  knownOperations: string[]
): boolean => {
  if (!operation || typeof operation !== "string") {
    return false;
  }
  return knownOperations.includes(operation.toLowerCase());
};

/**
 * Validates player data object has required fields
 * @param player - Player object to validate
 * @returns true if player has required fields, false otherwise
 */
export const validatePlayerData = (player: any): boolean => {
  return (
    player &&
    typeof player === "object" &&
    typeof player.username === "string" &&
    typeof player.lobby_id === "string" &&
    player.username.trim().length > 0 &&
    player.lobby_id.trim().length > 0
  );
};

/**
 * Validates vote data
 * @param voter - Username of voter
 * @param target - Username of vote target
 * @returns true if vote data is valid, false otherwise
 */
export const validateVoteData = (voter: string, target: string): boolean => {
  if (!voter || !target || typeof voter !== "string" || typeof target !== "string") {
    return false;
  }
  // Voter and target must be different
  if (voter.trim() === target.trim()) {
    return false;
  }
  // Both must be valid usernames
  return validateUsername(voter) && validateUsername(target);
};
