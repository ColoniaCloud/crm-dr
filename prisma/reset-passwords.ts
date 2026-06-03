import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const PASSWORD = "Polarizados@26";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, deletedAt: true },
  });

  console.log("Usuarios encontrados:");
  console.table(users.map(u => ({ nombre: u.name, email: u.email, rol: u.role, eliminado: u.deletedAt ? "Sí" : "No" })));

  const hash = await bcrypt.hash(PASSWORD, 12);

  for (const u of users) {
    await prisma.user.update({ where: { id: u.id }, data: { password: hash } });
    console.log(`✔ ${u.email} — contraseña actualizada`);
  }

  console.log(`\nTodos los usuarios ahora tienen la contraseña: ${PASSWORD}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
