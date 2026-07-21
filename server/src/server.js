import { app } from "./app.js";
import { env } from "./config/env.js";

app.listen(env.port, () => console.log(`VM Nexus API disponível em http://localhost:${env.port}`));

