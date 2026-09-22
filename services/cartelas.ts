import { parseCartelaCells } from "@/lib/bingo";
import { db } from "@/lib/prisma";

type CartelaRow = {
  id: string;
  index: number;
  cells: string;
};

export async function getCartelas() {
  const rows = (await db.orm.Cartela.select("id", "index", "cells").all()) as CartelaRow[];

  return rows
    .map((row) => ({
      id: row.id,
      index: row.index,
      cells: parseCartelaCells(row.cells),
    }))
    .sort((left, right) => left.index - right.index);
}

export async function getCartela(id: string) {
  const row = await db.orm.Cartela.select("id", "index", "cells")
    .where({ id })
    .first();

  if (!row) return null;

  return {
    id: row.id,
    index: row.index,
    cells: parseCartelaCells(row.cells),
  };
}
