import Head from "./Header";

export function Login() {
  return (
    <main className="flex items-center justify-center pt-16 pb-4">
      <div className="flex-1 flex flex-col items-center gap-16 min-h-0">
        <Head />
        <div className="max-w-[300px] w-full space-y-6 px-4">
          <input type="text" placeholder="name"></input>
          <input type="text" placeholder="Room Code"></input>
          <div className="grid grid-cols-2 gap-4">
            <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" >
              Create Room
            </button>
            <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
              Join Room
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}