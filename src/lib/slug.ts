/**
 * Slug público de municipio (v37 — SEO /lloguer/[slug]).
 * Determinista y estable: minúsculas, sin acentos (NFD), punto volat → ll,
 * no-alfanuméricos → "-", sin extremos. Colisiones (imposibles entre nombres
 * oficiales de municipios catalanes, pero por defensa): el backfill añade
 * el sufijo -{code}.
 */
export function slugifyName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // diacríticos (à, ç, ñ, í…)
    .replace(/\u00b7/g, "") // punt volat (l·l → ll)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
