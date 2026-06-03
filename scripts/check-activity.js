const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const acts = await p.$queryRawUnsafe(
    "SELECT u.name, COUNT(a.id) as total FROM activity_logs a JOIN users u ON a.userId = u.id GROUP BY u.name"
  );
  console.log("activity_logs por operador:");
  console.table(acts);

  const logs = await p.$queryRawUnsafe(
    "SELECT u.name, COUNT(o.id) as total FROM operator_audit_logs o JOIN users u ON o.userId = u.id GROUP BY u.name"
  );
  console.log("operator_audit_logs por operador:");
  console.table(logs);

  await p.$disconnect();
}
main();
