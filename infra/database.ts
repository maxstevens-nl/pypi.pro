const dbProject = neon.getProjectOutput({
  id: "ancient-butterfly-95061725",
});

const dbBranchId =
  $app.stage !== "prod"
    ? new neon.Branch("NeonBranch", {
        parentId: dbProject.defaultBranchId,
        projectId: dbProject.id,
        name: $app.stage,
      }).id
    : dbProject.defaultBranchId;

const dbEndpoints = neon.getBranchEndpointsOutput({
  projectId: dbProject.id,
  branchId: dbBranchId,
});
const dbEndpointHost = dbEndpoints.apply(({ endpoints = [] }) => {
  const endpoint = endpoints.find(({ type }) => type === "read_write");
  if (!endpoint) throw new Error("Neon read_write endpoint not found");
  return endpoint.host;
});

const dbRole = new neon.Role("NeonRole", {
  name: `pypi-pro-${$app.stage}-role`,
  branchId: dbBranchId,
  projectId: dbProject.id,
});

const db = new neon.Database(
  "NeonDatabaseRaw",
  {
    branchId: dbBranchId,
    projectId: dbProject.id,
    ownerName: dbRole.name,
    name: `pypi-pro-${$app.stage}`,
  },
  { dependsOn: [dbRole] },
);

const dbPort = 5432; // Default Neon port
export const database = new sst.Linkable("NeonDatabase", {
  properties: {
    name: db.name,
    user: dbRole.name,
    host: dbEndpointHost,
    port: dbPort,
    password: dbRole.password,
    connectionString: $interpolate`postgresql://${dbRole.name}:${dbRole.password}@${dbEndpointHost}:${dbPort}/${db.name}?sslmode=verify-full`,
  },
});

export const hyperdrive = new sst.cloudflare.Hyperdrive("Database", {
  origin: {
    scheme: "postgres",
    host: database.properties.host,
    port: database.properties.port,
    user: database.properties.user,
    password: database.properties.password,
    database: database.properties.name,
  },

  caching: $dev ? false : undefined,
});

export const outputs = {
  DATABASE_URL: database.properties.connectionString,
};
