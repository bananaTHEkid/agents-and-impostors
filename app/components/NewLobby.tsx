import Head from './Header'
import LobbySub from './LobbySub';

export default function Lobby() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <Head />
      <LobbySub />

      <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-4">
      Start Game
      </button>
    </div>
  );
}