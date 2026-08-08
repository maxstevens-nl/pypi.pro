import "./database";
import "./migrate";
import "./api";
import "./site";
import "./urls";

import { outputs as dbOutputs } from "./database";
import { outputs as routeOutputs } from "./routes";

export const outputs = { ...routeOutputs, ...dbOutputs };
