import type { Route } from "./+types/home";
import { Login } from "../components/login";
import Head from "../components/header";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "GAME" },
    { name: "description", content: "GAME APP" },
  ];
}

export default function Home() {
  return <Login />;
}