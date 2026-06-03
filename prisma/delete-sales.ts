import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find the sale for "Polarizados Walter Acosta"
  const walterSales = await prisma.sale.findMany({
    include: {
      contact: { select: { firstName: true, lastName: true, company: true } },
    },
  });

  const keepSales = walterSales.filter((s) => {
    const name =
      s.contact.company ||
      `${s.contact.firstName} ${s.contact.lastName}`.trim();
    return name.toLowerCase().includes("walter") && name.toLowerCase().includes("acosta");
  });

  const keepIds = keepSales.map((s) => s.id);
  console.log(
    `Found ${walterSales.length} total sales, keeping ${keepIds.length} (Walter Acosta)`
  );

  if (keepIds.length === 0) {
    console.log("WARNING: No sales matching 'Walter Acosta' found. Aborting.");
    return;
  }

  // Delete all sales except Walter's
  const toDelete = walterSales.filter((s) => !keepIds.includes(s.id));
  console.log(`Deleting ${toDelete.length} sales...`);

  for (const sale of toDelete) {
    const name =
      sale.contact.company ||
      `${sale.contact.firstName} ${sale.contact.lastName}`.trim();
    console.log(`  Deleting sale #${sale.number} - ${name}`);
    await prisma.payment.deleteMany({ where: { saleId: sale.id } });
    await prisma.remito.deleteMany({ where: { saleId: sale.id } });
    await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
    await prisma.sale.delete({ where: { id: sale.id } });
  }

  console.log("Done!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
