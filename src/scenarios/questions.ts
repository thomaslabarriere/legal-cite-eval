// ============================================================================
// Synthetic evaluation questions for LegalCiteEval.
//
// ILLUSTRATIVE / SYNTHETIC ONLY. These are made-up fact patterns used to
// exercise the evaluation instrument. This is NOT legal advice and NOT an
// authority on French law. Every keyAuthority is drawn from the small public
// corpus subset in ../corpus/corpus.ts.
// ============================================================================

import type { Question } from "../types.js";

export const questions: Question[] = [
  {
    id: "faute-delictuelle",
    title: "Responsabilité du fait personnel",
    question:
      "Une personne cause un dommage à autrui par sa faute. Sur quel fondement peut-elle être tenue de le réparer ?",
    expected: { keyAuthorities: ["1240"], requiresCitation: true },
  },
  {
    id: "force-obligatoire",
    title: "Force obligatoire du contrat",
    question:
      "Une partie à un contrat valablement formé peut-elle unilatéralement cesser de l'exécuter parce qu'elle ne le trouve plus avantageux ?",
    expected: { keyAuthorities: ["1103"], requiresCitation: true },
  },
  {
    id: "negociation-bonne-foi",
    title: "Rupture des pourparlers",
    question:
      "Un négociateur rompt brutalement et de mauvaise foi des pourparlers précontractuels avancés. Sa responsabilité peut-elle être engagée ?",
    expected: { keyAuthorities: ["1112"], requiresCitation: true },
  },
  {
    id: "dol",
    title: "Dol par réticence",
    question:
      "Un vendeur dissimule intentionnellement une information déterminante pour obtenir le consentement de l'acheteur. De quel vice du consentement s'agit-il ?",
    expected: { keyAuthorities: ["1137"], requiresCitation: true },
  },
  {
    id: "imprevision",
    title: "Imprévision",
    question:
      "Un changement de circonstances imprévisible lors de la conclusion du contrat rend son exécution excessivement onéreuse pour une partie. Que prévoit le droit ?",
    expected: { keyAuthorities: ["1195"], requiresCitation: true },
  },
  {
    id: "inexecution-dommages",
    title: "Dommages et intérêts contractuels",
    question:
      "Un débiteur n'exécute pas son obligation contractuelle et cause un préjudice au créancier. Sur quel fondement obtenir des dommages et intérêts ?",
    expected: { keyAuthorities: ["1231-1"], requiresCitation: true },
  },
  {
    id: "vie-privee",
    title: "Atteinte à la vie privée",
    question:
      "Un magazine publie sans autorisation des faits relevant de la vie privée d'une personne. Quel texte protège cette personne ?",
    expected: { keyAuthorities: ["9"], requiresCitation: true },
  },
  {
    id: "fait-des-choses",
    title: "Responsabilité du fait des choses",
    question:
      "Une chose que l'on a sous sa garde cause un dommage à un tiers. Sur quel fondement la responsabilité du gardien peut-elle être recherchée ?",
    expected: { keyAuthorities: ["1242"], requiresCitation: true },
  },

  // ── HARD, PARAPHRASED questions (Phase 4) ────────────────────────────────
  // Deliberately worded so the question vocabulary does NOT overlap the key
  // article's terse LABEL (and avoids the lexical retriever's synonym table),
  // so the lexical baseline scores the key article 0 and misses it. The key
  // article's GLOSS (indexed only by the embedding path) does share the
  // question's vocabulary, so semantic/hybrid recover it — which is what makes
  // the recall delta (hybrid > lexical) measurable rather than saturated.
  {
    id: "violence-economique",
    title: "Abus de dépendance",
    question:
      "Une partie profite de la situation de faiblesse de son partenaire pour lui arracher un engagement très déséquilibré à son seul avantage. Ce comportement peut-il justifier l'annulation ?",
    expected: { keyAuthorities: ["1143"], requiresCitation: true },
  },
  {
    id: "force-majeure",
    title: "Événement extérieur libératoire",
    question:
      "Un événement extérieur, imprévu et insurmontable empêche définitivement une partie de tenir son engagement. Cette partie est-elle exonérée de sa responsabilité ?",
    expected: { keyAuthorities: ["1218"], requiresCitation: true },
  },
  {
    id: "devoir-information",
    title: "Renseignement capital tu",
    question:
      "Avant de conclure, une partie détenait un renseignement capital pour la décision de son cocontractant et ne le lui a pas communiqué. A-t-elle manqué à une obligation légale ?",
    expected: { keyAuthorities: ["1112-1"], requiresCitation: true },
  },
  {
    id: "execution-forcee",
    title: "Fourniture concrète de la prestation",
    question:
      "Face à un engagement inexécuté, le créancier veut contraindre son partenaire à fournir concrètement la prestation promise plutôt que de se contenter d'une indemnité. Le peut-il ?",
    expected: { keyAuthorities: ["1221"], requiresCitation: true },
  },
];
