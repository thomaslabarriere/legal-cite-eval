import type { Corpus, CorpusEntry, LegalRef } from "../types.js";
import { normalizeRef } from "./normalize.js";

/**
 * A small, illustrative subset of the PUBLIC French Code civil (post-2016
 * reform of contract law, ordonnance 2016-131). Article numbers and short
 * labels are real; this is NOT legal advice and not exhaustive. Used so that
 * hallucinated-citation detection is grounded in a real corpus rather than a
 * toy set.
 *
 * `gloss` is a fuller, paraphrase-rich description of the article. Only the
 * EMBEDDING retrievers index it (see retrieve.ts / corpus.articleText); the
 * lexical baseline indexes the short `label` alone. Glosses are added to the
 * articles that the HARD paraphrased questions turn on, so that a question
 * whose vocabulary misses the terse label still reaches the article through its
 * gloss — which is exactly why hybrid recall beats lexical on the hard set.
 *
 * Several articles here are semantic DISTRACTORS — real neighbours in the same
 * family (offer/acceptance, defects of consent, non-performance remedies) whose
 * labels share vocabulary with a question but are NOT its key authority. They
 * make the retrieval problem non-trivial rather than a toy lookup.
 */
const ENTRIES: ReadonlyArray<{ article: LegalRef; label: string; gloss?: string }> = [
  { article: "9", label: "Respect de la vie privée" },
  { article: "544", label: "Droit de propriété" },
  { article: "1101", label: "Définition du contrat (accord de volontés créant des obligations)" },
  { article: "1102", label: "Liberté contractuelle" },
  { article: "1103", label: "Force obligatoire du contrat (les contrats légalement formés tiennent lieu de loi)" },
  { article: "1104", label: "Bonne foi dans la négociation, la formation et l'exécution du contrat" },
  { article: "1112", label: "Liberté et bonne foi dans les négociations précontractuelles" },
  // Distractor for the information-duty question: real precontractual article,
  // NOT the information duty (1112-1) that question turns on.
  { article: "1112-1", label: "Devoir précontractuel d'information",
    gloss: "Avant de conclure le contrat, la partie qui détient un renseignement capital pour la décision de son cocontractant doit spontanément le lui communiquer ; ce devoir d'information ne porte pas sur l'estimation de la valeur de la prestation." },
  { article: "1113", label: "Formation du contrat par la rencontre d'une offre et d'une acceptation" },
  { article: "1114", label: "L'offre comprend les éléments essentiels du contrat et exprime la volonté de son auteur d'être lié" },
  { article: "1116", label: "Rétractation de l'offre avant l'expiration du délai" },
  { article: "1120", label: "Le silence ne vaut pas acceptation, sauf loi, usages ou relations d'affaires" },
  { article: "1128", label: "Conditions de validité du contrat (consentement, capacité, contenu licite et certain)" },
  { article: "1130", label: "Vices du consentement (erreur, dol, violence)" },
  { article: "1131", label: "Les vices du consentement sont une cause de nullité relative du contrat" },
  { article: "1137", label: "Dol" },
  { article: "1143", label: "Violence par abus de l'état de dépendance",
    gloss: "Profiter de la situation de faiblesse ou de dépendance d'un cocontractant pour obtenir de lui un engagement qu'il n'aurait pas souscrit et en tirer un avantage manifestement excessif constitue une violence qui vicie le consentement et permet l'annulation." },
  { article: "1171", label: "Clause abusive du contrat d'adhésion créant un déséquilibre significatif (réputée non écrite)" },
  { article: "1178", label: "Nullité du contrat ne remplissant pas les conditions de validité" },
  { article: "1195", label: "Imprévision (révision pour changement imprévisible de circonstances)" },
  { article: "1217", label: "Sanctions de l'inexécution du contrat (options offertes au créancier)" },
  { article: "1218", label: "Force majeure en matière contractuelle",
    gloss: "Un événement extérieur, imprévu et insurmontable qui échappe au contrôle du débiteur et empêche définitivement de tenir son engagement l'exonère de sa responsabilité et peut entraîner la fin du contrat." },
  { article: "1219", label: "Exception d'inexécution (refuser d'exécuter si l'autre partie n'exécute pas)" },
  { article: "1221", label: "Exécution forcée en nature de l'obligation",
    gloss: "Le créancier d'un engagement inexécuté peut contraindre le partenaire défaillant à fournir concrètement la prestation promise plutôt qu'une simple indemnité, sauf si ce remède est impossible ou d'un coût manifestement déraisonnable." },
  { article: "1224", label: "Résolution du contrat pour inexécution" },
  { article: "1226", label: "Résolution unilatérale par notification aux risques du créancier, après mise en demeure" },
  { article: "1229", label: "La résolution met fin au contrat et donne lieu à restitutions" },
  { article: "1231-1", label: "Dommages et intérêts pour inexécution contractuelle" },
  { article: "1240", label: "Responsabilité du fait personnel (faute)" },
  { article: "1241", label: "Responsabilité pour négligence ou imprudence" },
  { article: "1242", label: "Responsabilité du fait des choses et du fait d'autrui" },
];

export const corpus: Corpus = Object.fromEntries(
  ENTRIES.map((e): [LegalRef, CorpusEntry] => {
    const article = normalizeRef(e.article);
    const entry: CorpusEntry = { article, label: e.label };
    if (e.gloss !== undefined) entry.gloss = e.gloss;
    return [article, entry];
  }),
);

/** True if the (normalized) citation exists in the corpus. */
export function existsInCorpus(ref: string): boolean {
  return normalizeRef(ref) in corpus;
}

/**
 * The text an EMBEDDING retriever indexes for an article: the label plus its
 * fuller gloss when present. The lexical baseline deliberately indexes only the
 * short `label`, so an article whose gloss (but not label) shares a question's
 * vocabulary is reachable by the semantic/hybrid path and not by lexical.
 */
export function articleText(entry: CorpusEntry): string {
  return entry.gloss ? `${entry.label}. ${entry.gloss}` : entry.label;
}

/** A compact listing of the corpus for the agent/judge prompt. */
export function renderCorpusForPrompt(): string {
  return Object.values(corpus)
    .map((e) => `- ${e.article}: ${e.label}`)
    .join("\n");
}

/**
 * Render only the given articles (RAG mode: the agent sees just the retrieved
 * subset). Unknown refs are skipped; order follows `refs`.
 */
export function renderArticlesForPrompt(refs: LegalRef[]): string {
  const lines: string[] = [];
  for (const ref of refs) {
    const entry = corpus[normalizeRef(ref)];
    if (entry) lines.push(`- ${entry.article}: ${entry.label}`);
  }
  return lines.length > 0 ? lines.join("\n") : "(no articles retrieved)";
}
