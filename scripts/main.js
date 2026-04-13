import {
  MODULE_ID,
  initFactionStatusTracker
} from "./status-tracker.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing`);
  initFactionStatusTracker();
});
