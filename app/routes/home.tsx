import type { Route } from "./+types/home";
import { Welcome } from "../components/welcome/welcome";
import Head from "../components/header/header";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "GAME" },
    { name: "description", content: "GAME APP" },
  ];
}

export default function Home() {
  return <Welcome />;
}