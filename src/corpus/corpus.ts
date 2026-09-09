import type { Corpus, CorpusEntry, LegalRef } from "../types.js";
import { normalizeRef } from "./normalize.js";

/**
 * A small, illustrative subset of the PUBLIC French Code civil (post-2016
 * reform of contract law). Article numbers and short labels are real; this is
 * NOT legal advice and not exhaustive. Used so that hallucinated-citation
 * detection is grounded in a real corpus rather than a toy set.
 */
const ENTRIES: ReadonlyArray<{ article: LegalRef; label: string }> = [
  { article: "9", label: "Respect de la vie privée" },
  { article: "544", label: "Droit de propriété" },
  { article: "1103", label: "Force obligatoire du contrat (les contrats légalement formés tiennent lieu de loi)" },
  { article: "1104", label: "Bonne foi dans la négociation, la formation et l'exécution du contrat" },
  { article: "1112", label: "Liberté et bonne foi dans les négociations précontractuelles" },
  { article: "1128", label: "Conditions de validité du contrat (consentement, capacité, contenu licite et certain)" },
  { article: "1130", label: "Vices du consentement (erreur, dol, violence)" },
  { article: "1137", label: "Dol" },
  { article: "1195", label: "Imprévision (révision pour changement imprévisible de circonstances)" },
  { article: "1231-1", label: "Dommages et intérêts pour inexécution contractuelle" },
  { article: "1240", label: "Responsabilité du fait personnel (faute)" },
  { article: "1241", label: "Responsabilité pour négligence ou imprudence" },
  { article: "1242", label: "Responsabilité du fait des choses et du fait d'autrui" },
];

export const corpus: Corpus = Object.fromEntries(
  ENTRIES.map((e): [LegalRef, CorpusEntry] => {
    const article = normalizeRef(e.article);
    return [article, { article, label: e.label }];
  }),
);

/** True if the (normalized) citation exists in the corpus. */
export function existsInCorpus(ref: string): boolean {
  return normalizeRef(ref) in corpus;
}

/** A compact listing of the corpus for the agent/judge prompt. */
export function renderCorpusForPrompt(): string {
  return Object.values(corpus)
    .map((e) => `- ${e.article}: ${e.label}`)
    .join("\n");
}
