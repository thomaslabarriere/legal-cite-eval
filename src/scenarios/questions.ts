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
];
