const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function audit() {
  // Count total leads
  const total = await p.contact.count({ where: { type: "LEAD" } });
  console.log("Total leads:", total);

  // Count leads with/without each field
  const withAddress = await p.contact.count({ where: { type: "LEAD", address: { not: null, not: "" } } });
  const withCity = await p.contact.count({ where: { type: "LEAD", city: { not: null, not: "" } } });
  const withState = await p.contact.count({ where: { type: "LEAD", state: { not: null, not: "" } } });
  console.log("\nField coverage:");
  console.log("  address:", withAddress, "/", total);
  console.log("  city:", withCity, "/", total);
  console.log("  state:", withState, "/", total);

  // Sample 20 leads to see the address patterns
  const samples = await p.contact.findMany({
    where: { type: "LEAD" },
    select: { id: true, address: true, city: true, state: true, company: true },
    take: 30,
    orderBy: { createdAt: "desc" },
  });
  console.log("\nSample leads (30 most recent):");
  samples.forEach((s, i) => {
    console.log(`  ${i + 1}. [${s.company || "?"}] address="${s.address}" | city="${s.city}" | state="${s.state}"`);
  });

  // Check for leads where address contains city/state info (comma-separated)
  const addressWithCommas = await p.contact.count({
    where: { type: "LEAD", address: { contains: "," } },
  });
  console.log("\nLeads with commas in address:", addressWithCommas);

  // State distribution
  const stateGroups = await p.contact.groupBy({
    by: ["state"],
    where: { type: "LEAD" },
    _count: true,
    orderBy: { _count: { state: "desc" } },
  });
  console.log("\nState distribution:");
  stateGroups.forEach((g) => {
    console.log(`  ${g.state || "(null/empty)"}: ${g._count} leads`);
  });

  await p.$disconnect();
}

audit().catch((e) => { console.error(e); process.exit(1); });
