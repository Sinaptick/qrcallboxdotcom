// server/index.js
import { startInsightsServer } from "./insights-ai.js";

startInsightsServer(process.env.PORT || 8787);
