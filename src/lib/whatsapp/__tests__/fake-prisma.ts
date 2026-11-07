import { Prisma } from "@prisma/client";

/**
 * Prisma de juguete, en memoria, con solo lo que usa el procesador del webhook.
 *
 * No intenta ser Prisma: implementa las pocas consultas que hacemos y, sobre
 * todo, **se comporta como la base en lo que importa para estas pruebas** — una
 * clave única repetida tira P2002, y `updateMany` filtra por las mismas
 * condiciones (`OR`, `in`, `null`) con las que lo escribimos. Cada operación cede
 * el turno antes de ejecutar, para que dos entregas "simultáneas" (Promise.all)
 * se intercalen como lo harían contra una base real.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;
type OrderBy = Record<string, "asc" | "desc">;

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Where[]).some((w) => matches(row, w));
    if (key === "AND") return (cond as Where[]).every((w) => matches(row, w));
    const value = row[key];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; not?: unknown; equals?: unknown; gte?: Date; lt?: Date };
      if (c.in) return c.in.includes(value);
      if (c.gte) return value instanceof Date && value >= c.gte;
      if (c.lt) return value instanceof Date && value < c.lt;
      if ("not" in c) return value !== c.not;
      if ("equals" in c) return value === c.equals;
    }
    return value === cond;
  });
}

function uniqueViolation(target: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on ${target}`, {
    code: "P2002",
    clientVersion: "test",
    meta: { target: [target] },
  });
}

export class FakeTable {
  rows: Row[] = [];
  private counter = 0;
  constructor(
    private readonly unique: string[] = [],
    private readonly defaults: () => Row = () => ({})
  ) {}

  reset(): void {
    this.rows = [];
    this.counter = 0;
  }

  async findUnique(args: { where: Where; select?: unknown }): Promise<Row | null> {
    await tick();
    return this.rows.find((r) => matches(r, args.where)) ?? null;
  }

  async findFirst(args: { where?: Where; orderBy?: OrderBy } = {}): Promise<Row | null> {
    return (await this.findMany({ ...args, take: 1 }))[0] ?? null;
  }

  async findMany(args: { where?: Where; orderBy?: OrderBy; take?: number } = {}): Promise<Row[]> {
    await tick();
    let out = this.rows.filter((r) => matches(r, args.where ?? {}));
    if (args.orderBy) {
      const [[field, dir]] = Object.entries(args.orderBy);
      const sign = dir === "desc" ? -1 : 1;
      out = [...out].sort((a, b) => (a[field]! < b[field]! ? -sign : a[field]! > b[field]! ? sign : 0));
    }
    return args.take ? out.slice(0, args.take) : out;
  }

  async count(args: { where?: Where } = {}): Promise<number> {
    await tick();
    return this.rows.filter((r) => matches(r, args.where ?? {})).length;
  }

  async create(args: { data: Row }): Promise<Row> {
    await tick();
    for (const key of this.unique) {
      if (this.rows.some((r) => r[key] !== undefined && r[key] === args.data[key])) throw uniqueViolation(key);
    }
    const row: Row = { id: `row_${++this.counter}`, ...this.defaults(), ...args.data };
    this.rows.push(row);
    return row;
  }

  async update(args: { where: Where; data: Row }): Promise<Row> {
    await tick();
    const row = this.rows.find((r) => matches(r, args.where));
    if (!row) throw new Error("Registro no encontrado");
    Object.assign(row, args.data);
    return row;
  }

  async updateMany(args: { where: Where; data: Row }): Promise<{ count: number }> {
    await tick();
    const hit = this.rows.filter((r) => matches(r, args.where));
    for (const r of hit) Object.assign(r, args.data);
    return { count: hit.length };
  }

  async upsert(args: { where: Where; create: Row; update: Row }): Promise<Row> {
    await tick();
    const row = this.rows.find((r) => matches(r, args.where));
    if (row) return Object.assign(row, args.update);
    return this.create({ data: args.create });
  }

  async delete(args: { where: Where }): Promise<Row> {
    await tick();
    const i = this.rows.findIndex((r) => matches(r, args.where));
    if (i < 0) throw new Error("Registro no encontrado");
    return this.rows.splice(i, 1)[0];
  }

  async deleteMany(args: { where?: Where } = {}): Promise<{ count: number }> {
    await tick();
    const keep = this.rows.filter((r) => !matches(r, args.where ?? {}));
    const count = this.rows.length - keep.length;
    this.rows = keep;
    return { count };
  }
}

/**
 * Emula la única consulta cruda que hacemos (buscar fichas por los últimos
 * dígitos del teléfono, ver `findContactsByPhone`): el único valor enlazado es
 * el sufijo, y su largo es el de la comparación.
 */
async function queryRaw(sql: { values: unknown[] }): Promise<{ id: string }[]> {
  await tick();
  const suffix = String(sql.values[0]);
  const endsWith = (v: unknown) => {
    const digits = String(v ?? "").replace(/\D/g, "");
    return digits.length >= suffix.length && digits.endsWith(suffix);
  };
  return fakePrisma.contact.rows
    .filter((r) => endsWith(r.whatsapp) || endsWith(r.phone) || endsWith(r.phoneE164))
    .slice(0, 5)
    .map((r) => ({ id: String(r.id) }));
}

export const fakePrisma = {
  $queryRaw: queryRaw,
  whatsAppCloudMessage: new FakeTable(["wamid"], () => ({
    status: null,
    statusUpdatedAt: null,
    errors: null,
    contactId: null,
    sentById: null,
    templateName: null,
    createdAt: new Date(),
  })),
  whatsAppCloudContact: new FakeTable(["waId"], () => ({
    name: null,
    profile: null,
    contactId: null,
    firstSeen: new Date(),
    lastSeen: new Date(),
  })),
  contact: new FakeTable([], () => ({ deletedAt: null })),
};

export function resetFakePrisma(): void {
  fakePrisma.whatsAppCloudMessage.reset();
  fakePrisma.whatsAppCloudContact.reset();
  fakePrisma.contact.reset();
}
