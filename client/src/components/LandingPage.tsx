import React, { useState, useEffect } from "react";
// import { Container, Card, Button, Form, Alert } from "react-bootstrap"; // Remove Bootstrap import
import axios from "axios";
import { io, Socket } from "socket.io-client";
import { LandingPageProps } from "../types";
import { Button } from "../components/ui/button"; // Shadcn button
import { Card, CardContent } from "../components/ui/card"; // Shadcn card
import { Input } from "../components/ui/input"; // Shadcn input
import { Label } from "../components/ui/label"; // Shadcn label
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert"; // Shadcn alert
import { AlertCircle } from "lucide-react"; // Icon for alert

interface JoinSuccessData {
  lobbyCode: string;
}

interface ErrorData {
  message: string;
}

interface CreateLobbyResponse {
  lobbyId: string;
  lobbyCode: string;
}

const LandingPage: React.FC<LandingPageProps> = ({ onJoinGame }) => {
  const [username, setUsername] = useState("");
  const [lobbyCode, setLobbyCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io("http://localhost:5000");
    setSocket(newSocket);

    // Set up socket event listeners
    newSocket.on("join-success", (data: JoinSuccessData) => {
      const currentUsername = username; // Capture the current username
      sessionStorage.setItem("lobbyCode", data.lobbyCode);
      sessionStorage.setItem("username", currentUsername);
      sessionStorage.setItem("isHost", "false");
      setIsLoading(false);
      onJoinGame(data.lobbyCode);
    });

    newSocket.on("error", (error: ErrorData) => {
      setErrorMessage(error.message || "An error occurred");
      setIsLoading(false);
    });

    // Cleanup on unmount
    return () => {
      newSocket.off("join-success");
      newSocket.off("error");
      newSocket.disconnect();
    };
  }, [username, onJoinGame]);

  const handleJoinLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    const trimmedLobbyCode = lobbyCode.trim();

    if (!trimmedUsername || !trimmedLobbyCode) {
      setErrorMessage("Please fill in all fields");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      socket?.emit("join-lobby", { 
        username: trimmedUsername, 
        lobbyCode: trimmedLobbyCode 
      });
    } catch {
      setErrorMessage("Failed to join lobby");
      setIsLoading(false);
    }
  };

  const handleCreateLobby = async () => {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      setErrorMessage("Please enter a username");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await axios.post<CreateLobbyResponse>("http://localhost:5000/api/lobbies/create");
      const { lobbyId, lobbyCode } = response.data;
      
      sessionStorage.setItem("lobbyCode", lobbyCode);
      sessionStorage.setItem("username", trimmedUsername);
      sessionStorage.setItem("isHost", "true");
      
      socket?.emit("join-lobby", { 
        username: trimmedUsername, 
        lobbyCode 
      });
    } catch (error) {
      setErrorMessage("Failed to create lobby");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-6 p-6">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold">Welcome to Triple</h1>
            <p className="text-gray-500">Join or create a game to get started</p>
          </div>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleJoinLobby} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lobbyCode">Lobby Code</Label>
              <Input
                id="lobbyCode"
                type="text"
                value={lobbyCode}
                onChange={(e) => setLobbyCode(e.target.value)}
                placeholder="Enter lobby code"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-4">
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? "Joining..." : "Join Game"}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">Or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleCreateLobby}
                disabled={isLoading}
              >
                {isLoading ? "Creating..." : "Create New Game"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LandingPage;
