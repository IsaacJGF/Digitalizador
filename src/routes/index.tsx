import { pageMetadata } from "@/lib/page-metadata";
import { createFileRoute } from "@tanstack/react-router";
import { DigitalizarPage } from "@/components/digitalizar/DigitalizarPage";

export const Route = createFileRoute("/")({
  head: () => pageMetadata("Digitalizar questão", "Envie imagens ou PDF de questões para revisão e exportação em Word."),
  component: DigitalizarPage,
});
