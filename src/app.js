import Olum from "olum";
import { Localize } from "olum-helpers";
import router from "./router/index.js";
import Home from "./views/home.js";
import en from "./locales/en.js";
import ar from "./locales/ar.js";

// translations
new Localize({ en, ar }, ["ar"]);
console.log("olumDesc".trans());
// new Olum({ prefix: "app" }).$("#app").use(Home);
new Olum({ prefix: "app" }).$("#app").use(router);


// if ("serviceWorker" in navigator) { // uncomment to enable service worker when deploying
//   window.on("load", () => navigator.serviceWorker.register("/service-worker.js").catch(console.error));
// }