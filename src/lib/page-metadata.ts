export function pageMetadata(title: string, description: string) {
  return { meta: [
    { title: `${title} — Digitalizador de Questões` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — Digitalizador de Questões` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] };
}