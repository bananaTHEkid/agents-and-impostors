import PlayerLabel from "./PlayerLabel"

export default function LobbySub() {
  return (
    <div className="border-2 border-white w-[40vw] p-3">
      <label className="block text-center w-full">Lobby</label>
      <label className="block text-center w-full">LobbyCode</label>
      <ul className="flex flex-wrap justify-between" >
        <li><PlayerLabel /></li>
        <li><PlayerLabel /></li>
        <li><PlayerLabel /></li>
        <li><PlayerLabel /></li>
        <li><PlayerLabel /></li>
        <li><PlayerLabel /></li>
        <li><PlayerLabel /></li>
      </ul>
    </div>
  )
}