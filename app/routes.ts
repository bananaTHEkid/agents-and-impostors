import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("test", "routes/test.tsx"),
    route("lobby", "routes/Lobby.tsx"),
] satisfies RouteConfig;
