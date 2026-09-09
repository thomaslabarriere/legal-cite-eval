// ============================================================================
// Judge calibration gold set for LegalCiteEval.
//
// ILLUSTRATIVE / SYNTHETIC ONLY — NOT legal advice. Hand-labelled (question,
// answer, citation, relevant) tuples used to measure the reliability of the
// LLM-as-a-Judge: does the cited article actually support the given answer?
// The `question` strings are reused/adapted from ../scenarios/questions.ts so a
// deterministic judge keyed by question can be calibrated against these labels.
// Every article used is in the public corpus subset (../corpus/corpus.ts).
// Roughly balanced between relevant (true) and irrelevant (false) pairs.
// ============================================================================

import type { JudgeGoldItem } from "../types.js";

export const judgeGold: JudgeGoldItem[] = [
  // --- Clearly relevant ---
  {
    question:
      "Une personne cause un dommage à autrui par sa faute. Sur quel fondement peut-elle être tenue de le réparer ?",
    answer:
      "L'auteur d'une faute ayant causé un dommage doit le réparer au titre de la responsabilité du fait personnel.",
    citation: "1240",
    relevant: true,
  },
  {
    question:
      "Une partie à un contrat valablement formé peut-elle unilatéralement cesser de l'exécuter ?",
    answer:
      "Non : les contrats légalement formés tiennent lieu de loi aux parties, qui ne peuvent s'y soustraire unilatéralement.",
    citation: "1103",
    relevant: true,
  },
  {
    question:
      "Un négociateur rompt brutalement et de mauvaise foi des pourparlers précontractuels. Sa responsabilité peut-elle être engagée ?",
    answer:
      "Oui, la liberté de négocier doit s'exercer de bonne foi ; une rupture fautive engage la responsabilité de son auteur.",
    citation: "1112",
    relevant: true,
  },
  {
    question:
      "Un vendeur dissimule intentionnellement une information déterminante pour obtenir le consentement de l'acheteur. De quel vice s'agit-il ?",
    answer:
      "Il s'agit d'un dol par réticence : la dissimulation intentionnelle d'une information déterminante vicie le consentement.",
    citation: "1137",
    relevant: true,
  },
  {
    question:
      "Un changement de circonstances imprévisible rend l'exécution du contrat excessivement onéreuse. Que prévoit le droit ?",
    answer:
      "La partie lésée peut demander une renégociation au titre de l'imprévision.",
    citation: "1195",
    relevant: true,
  },
  {
    question:
      "Un débiteur n'exécute pas son obligation contractuelle et cause un préjudice. Sur quel fondement obtenir réparation ?",
    answer:
      "Le débiteur est condamné au paiement de dommages et intérêts pour inexécution du contrat.",
    citation: "1231-1",
    relevant: true,
  },
  {
    question:
      "Un magazine publie sans autorisation des faits relevant de la vie privée d'une personne. Quel texte la protège ?",
    answer:
      "Chacun a droit au respect de sa vie privée, ce qui interdit une telle publication sans autorisation.",
    citation: "9",
    relevant: true,
  },

  // --- Clearly irrelevant (right topic, wrong article) ---
  {
    question:
      "Une personne cause un dommage à autrui par sa faute. Sur quel fondement peut-elle être tenue de le réparer ?",
    answer:
      "L'auteur d'une faute ayant causé un dommage doit le réparer au titre de la responsabilité du fait personnel.",
    citation: "544",
    relevant: false,
  },
  {
    question:
      "Un vendeur dissimule intentionnellement une information déterminante pour obtenir le consentement de l'acheteur. De quel vice s'agit-il ?",
    answer:
      "Il s'agit d'un dol par réticence : la dissimulation intentionnelle d'une information déterminante vicie le consentement.",
    citation: "1242",
    relevant: false,
  },
  {
    question:
      "Un magazine publie sans autorisation des faits relevant de la vie privée d'une personne. Quel texte la protège ?",
    answer:
      "Chacun a droit au respect de sa vie privée, ce qui interdit une telle publication sans autorisation.",
    citation: "1195",
    relevant: false,
  },
  {
    question:
      "Une chose que l'on a sous sa garde cause un dommage à un tiers. Sur quel fondement rechercher la responsabilité du gardien ?",
    answer:
      "Le gardien d'une chose répond du dommage qu'elle cause, au titre de la responsabilité du fait des choses.",
    citation: "1103",
    relevant: false,
  },

  // --- Subtle ones (plausible but off) ---
  {
    // 1130 states the vices exist; 1137 is the specific dol basis. The answer
    // asserts the DEFINITION of dol, so citing only the generic 1130 is a weak
    // support but still arguably on-point — labelled relevant as a near-miss true.
    question:
      "Un vendeur dissimule intentionnellement une information déterminante pour obtenir le consentement de l'acheteur. De quel vice s'agit-il ?",
    answer:
      "Il s'agit d'un dol, l'un des vices du consentement qui peut entraîner la nullité du contrat.",
    citation: "1130",
    relevant: true,
  },
  {
    // Custody-of-a-thing answer citing 1240 (personal fault): a classic subtle
    // confusion — the fait des choses regime (1242) is no-fault, so 1240 does
    // NOT support this answer.
    question:
      "Une chose que l'on a sous sa garde cause un dommage à un tiers. Sur quel fondement rechercher la responsabilité du gardien ?",
    answer:
      "La responsabilité du gardien est engagée de plein droit du seul fait de la chose, sans qu'une faute personnelle soit exigée.",
    citation: "1240",
    relevant: false,
  },
];
