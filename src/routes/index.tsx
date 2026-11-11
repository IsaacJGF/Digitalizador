import { createFileRoute } from "@tanstack/react-router";
import { DigitalizarPage } from "@/components/digitalizar/DigitalizarPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Digitalizar questão — Digitalizador de Questões" },
      { name: "description", content: "Envie imagens ou PDF de questões e prepare o material para revisão e exportação em Word." },
    ],
  }),
  component: DigitalizarPage,
});
