import Head from "./Header";
import { NavLink } from "react-router";
import { useEffect, useState } from "react";
import { setegid } from "process";

export function Login() {

  const [data, setData] = useState(null);
  const [name, setName] = useState("");
  const [lobbyCode, setlobbyCode] = useState("");

  const postData = () => {
    fetch("http://localhost:3000/lobby/create-lobby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, lobbyCode }),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Response data: ", data);
        setData(data);
      })
      .catch((error) => console.error("Error posting data:", error));
  };

  return (
    <main className="flex items-center justify-center pt-16 pb-4">
      <div className="flex-1 flex flex-col items-center gap-16 min-h-0">
        <Head />
        <div className="max-w-[300px] w-full space-y-6 px-4">

          <input 
            type="text" 
            placeholder="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          ></input>

          <input 
            type="text" 
            placeholder="lobbyCode"
            value={lobbyCode}
            onChange={(e) => setlobbyCode(e.target.value)}
          ></input>

          <div className="grid grid-cols-2 gap-4">
            <NavLink to="/lobby">
              <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" 
              onClick={postData}
              >
                Create Room
              </button>
            </NavLink>

            <NavLink to="/lobby">
              <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                Join Room
              </button>
            </NavLink>
          </div>
          
        </div>
        
      </div>
    </main>
  );
}