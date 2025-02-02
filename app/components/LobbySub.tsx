import PlayerLabel from "./PlayerLabel"

export default function LobbySub() {
  return (
    <div className="flex justify-center">
      <ul>
      <li><PlayerLabel></PlayerLabel></li>
      <li><PlayerLabel></PlayerLabel></li>
      <li><PlayerLabel></PlayerLabel></li>
      <li><PlayerLabel></PlayerLabel></li>
      <li><PlayerLabel></PlayerLabel></li>
      <li><PlayerLabel></PlayerLabel></li>
      </ul>
    </div>
  )
}