import OlumRouter from "olum-router";

import Home from "../views/home.js";
import Settings from "../views/settings.js";
import Add from "../views/add.js";
import Edit from "../views/edit.js";
import Features from "../views/features.js";
import NotFound from "../views/notfound.js";

const routes = [
  { path: "/", comp: Home },
  { path: "/add", comp: Add },
  { path: "/edit", comp: Edit },
  { path: "/settings", comp: Settings },
  { path: "/features", comp: Features },
  { path: "/err", comp: NotFound },
];

const router = new OlumRouter({ mode: "history", root: "/", err: "/err" , routes });
export default router;