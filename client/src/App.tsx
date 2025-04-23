import React, { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import axios from "axios";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent } from "./components/ui/card";
import { motion } from "framer-motion";

const socket: Socket = io("http://localhost:5000"); // Replace with your backend URL

enum View {
  Landing,
  Lobby,
  Game,
}

const App = () => {
  const [view, setView] = useState<View>(View.Landing);
  const [lobbyCode, setLobbyCode] = useState("");
  const [username, setUsername] = useState("");
  const [lobbyId, setLobbyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    socket.on("team-assignment", (data) => addMessage(`Team assigned: ${data.team}`));
    socket.on("operation-assigned", (data) => addMessage(`Operation assigned: ${data.operation}`));
    socket.on("operation-phase-complete", () => addMessage("Operation phase completed."));
    socket.on("vote-submitted", () => addMessage("A vote was submitted."));
    socket.on("game-results", (data) => addMessage(`Game results: ${JSON.stringify(data)}`));
    socket.on("error", (err) => addMessage(`Error: ${err.message}`));

    return () => {
      socket.disconnect();
    };
  }, []);

  const addMessage = (msg: string) => {
    setMessages((prev) => [...prev, msg]);
  };

  const createLobby = async () => {
    try {
      interface CreateLobbyResponse {
        lobbyId: string;
        lobbyCode: string;
      }

      const response = await axios.post<CreateLobbyResponse>("http://localhost:5000/create-lobby",
        {username},
        {withCredentials: true}
      );
      const data = response.data;
      setLobbyId(data.lobbyId);
      setLobbyCode(data.lobbyCode);
      addMessage(`Lobby created: ${response.data.lobbyCode}`);
      setView(View.Lobby);
    } catch (err: any) {
      addMessage(`Create lobby failed: ${err.message}`);
    }
  };

  const joinLobby = () => {
    socket.emit("join-lobby", { username, lobbyCode });
    socket.on("player-joined", (data) => {
      addMessage(`${data.username} joined lobby.`);
      setLobbyId(data.lobbyId);
      setView(View.Lobby);
    });
  };

  const renderLanding = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md p-6">
      <Card className="rounded-2xl shadow-xl p-6 space-y-4">
        <CardContent className="space-y-4">
          <h1 className="text-3xl font-bold text-center">Game Lobby</h1>
          <Input
            placeholder="Enter your nickname"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Button onClick={createLobby} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            Create Lobby
          </Button>
          <Input
            placeholder="Enter lobby code to join"
            value={lobbyCode}
            onChange={(e) => setLobbyCode(e.target.value)}
          />
          <Button onClick={joinLobby} className="w-full bg-green-600 hover:bg-green-700 text-white">
            Join Lobby
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );

  const renderLobby = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-xl p-6">
      <Card className="rounded-2xl shadow-xl p-6 space-y-4">
        <h1 className="text-2xl font-bold text-center">Lobby Code: {lobbyCode}</h1>
        <Button onClick={startGame} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
          Start Game
        </Button>
        <div className="bg-gray-100 rounded p-4">
          <h2 className="font-semibold mb-2">Messages</h2>
          <ul className="list-disc ml-4 space-y-1 text-sm">
            {messages.map((msg, idx) => (
              <li key={idx}>{msg}</li>
            ))}
          </ul>
        </div>
      </Card>
    </motion.div>
  );

  const startGame = () => {
    socket.emit("start-game", { lobbyId });
    setView(View.Game);
  };

  const submitVote = (vote: string) => {
    socket.emit("submit-vote", { lobbyId, vote });
  };

  const renderGame = () => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-xl p-6">
      <Card className="rounded-2xl shadow-xl p-6 space-y-4">
        <h1 className="text-xl font-bold">Game View</h1>
        <div className="flex justify-center space-x-4">
          <Button onClick={() => submitVote("yes")} className="bg-yellow-500 hover:bg-yellow-600 text-white">
            Vote Yes
          </Button>
          <Button onClick={() => submitVote("no")} className="bg-red-500 hover:bg-red-600 text-white">
            Vote No
          </Button>
        </div>
        <div className="bg-gray-100 rounded p-4">
          <h2 className="font-semibold mb-2">Messages</h2>
          <ul className="list-disc ml-4 space-y-1 text-sm">
            {messages.map((msg, idx) => (
              <li key={idx}>{msg}</li>
            ))}
          </ul>
        </div>
      </Card>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 flex items-center justify-center">
      {view === View.Landing && renderLanding()}
      {view === View.Lobby && renderLobby()}
      {view === View.Game && renderGame()}
    </div>
  );
};

export default App;
