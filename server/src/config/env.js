import "dotenv/config";

const required = ["DATABASE_URL", "JWT_SECRET"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Variável obrigatória ausente: ${name}`);
}

export const env = {
  port: Number(process.env.PORT || 3340),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5174",
  adminEmail: process.env.NEXUS_ADMIN_EMAIL,
  adminPassword: process.env.NEXUS_ADMIN_PASSWORD,
  integrationSecret: process.env.NEXUS_INTEGRATION_SECRET || "",
};
