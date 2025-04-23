import React, { useState, useEffect } from "react";
// import { Container, Card, Button, Form, Alert } from "react-bootstrap"; // Remove Bootstrap import
import axios from "axios";
import { io } from "socket.io-client";
import { LandingPageProps } from "../types";
import { Button } from "@/components/ui/button"; // Shadcn button
import { Card, CardContent } from "@/components/ui/card"; // Shadcn card
import { Input } from "@/components/ui/input"; // Shadcn input
import { Label } from "../components/ui/label"; // Shadcn label
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert"; // Shadcn alert
import { AlertCircle } from "lucide-react"; // Icon for alert

const socket = io("http://localhost:5000");

const LandingPage: React.FC<LandingPageProps> = ({ onJoinGame }) => {
  const [username, setUsername] = useState("");
  const [lobbyCode, setLobbyCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Set up socket event listeners
    socket.on("join-success", (data: any) => {
      sessionStorage.setItem("lobbyCode", data.lobbyCode);
      sessionStorage.setItem("username", username);
      sessionStorage.setItem("isHost", "false");
      setIsLoading(false);
      onJoinGame(data.lobbyCode);
    });

    socket.on("error", (error: any) => {
      setErrorMessage(error.message || "An error occurred");
      setIsLoading(false);
    });

    // Cleanup on unmount
    return () => {
      socket.off("join-success");
      socket.off("error");
    };
  }, [username, onJoinGame]);

  const handleJoinLobby = async () => {
    if (!username) {
      setErrorMessage("Please enter your name");
      return;
    }
    if (!lobbyCode) {
      setErrorMessage("Please enter lobby code");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      socket.emit("join-lobby", { username, lobbyCode });
    } catch (error) {
      setErrorMessage("Failed to join lobby");
      setIsLoading(false);
    }
  };

  const handleCreateLobby = async () => {
    if (!username) {
      setErrorMessage("Please enter your name");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await axios.post<{ lobbyId: string, lobbyCode: string }>("http://localhost:5000/create-lobby", {
        username,
      });
      if (response.data.lobbyCode) {
        sessionStorage.setItem("lobbyCode", response.data.lobbyCode);
        sessionStorage.setItem("username", username);
        sessionStorage.setItem("isHost", "true");
        setIsLoading(false);
        onJoinGame(response.data.lobbyCode);
      } else {
        setErrorMessage("Failed to create lobby");
        setIsLoading(false);
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        setErrorMessage(error.response.data.error);
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Error creating lobby");
      }
      setIsLoading(false);
    }
  };

  return (
    // Replace Container with Tailwind classes for centering
    // Remove inline style for minHeight, handled by Tailwind bg gradient in App.tsx if desired
    // <Container
    //   className="d-flex justify-content-center align-items-center"
    //   style={{ minHeight: "100vh" }}
    // >
      // Use Shadcn Card with Tailwind for sizing
      <Card className="w-full max-w-md mx-auto"> 
        {/* Use Shadcn CardHeader and CardTitle */}
        <div className="text-center bg-primary text-primary-foreground py-4 rounded-t-lg"> 
          <h2 className="text-2xl font-bold">Text Party Game</h2>
        </div>
        {/* Use Shadcn CardContent */}
        <CardContent className="p-6 space-y-4"> 
          {errorMessage && (
            // Use Shadcn Alert
            <Alert variant="destructive"> 
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
              {/* Simple close button or remove onClose/dismissible logic for now */}
            </Alert>
          )}
          {/* Replace Form with simple divs and Tailwind for spacing */}
          <div className="space-y-2"> 
            {/* Replace Form.Group and Form.Label with Shadcn Label */}
            <Label htmlFor="username">Enter your name</Label> 
            {/* Replace Form.Control with Shadcn Input */}
            <Input 
              id="username"
              type="text"
              placeholder="Enter your name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2"> 
            <Label htmlFor="lobbyCode">Enter lobby code</Label>
            <Input 
              id="lobbyCode"
              type="text"
              placeholder="Enter lobby code"
              value={lobbyCode}
              onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
              disabled={isLoading}
              maxLength={6} // Assuming lobby code length
            />
          </div>
          {/* Replace div and Bootstrap Buttons with Shadcn Buttons and Tailwind for layout */}
          <div className="flex gap-2 pt-2"> 
            <Button
              className="flex-1" // Tailwind for equal width
              onClick={handleJoinLobby}
              disabled={isLoading}
            >
              {isLoading ? "Joining..." : "Join Lobby"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleCreateLobby}
              disabled={isLoading}
            >
              {isLoading ? "Creating..." : "Create Lobby"}
            </Button>
          </div>
        </CardContent>
      </Card>
    // </Container> Remove closing tag
  );
};

export default LandingPage;
