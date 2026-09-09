// ============================================================================
// Judge calibration gold set for LegalCiteEval.
//
// ILLUSTRATIVE / SYNTHETIC ONLY — NOT legal advice. Hand-labelled (question,
// answer, citation, relevant) tuples used to measure the reliability of the
// LLM-as-a-Judge: does the cited article actually support the given answer?
//
// The `question` of each item is taken VERBATIM from ../scenarios/questions.ts
// (via `q(id)`) so that a deterministic judge keyed on the question string can
// be calibrated against these labels without the two files drifting apart.
// Every article used is in the public corpus subset (../corpus/corpus.ts).
// ============================================================================

import type { JudgeGoldItem } from "../types.js";
import { questions } from "./questions.js";

/** Exact question text for a question id (throws if the id is unknown). */
function q(id: string): string {
  const found = questions.find((x) => x.id === id);
  if (!found) throw new Error(`judge_gold references unknown question id: ${id}`);
  return found.question;
}

export const judgeGold: JudgeGoldItem[] = [
  // --- Clearly relevant (the article is the correct basis) ---
  {
    question: q("faute-delictuelle"),
    answer:
      "L'auteur d'une faute ayant causé un dommage doit le réparer au titre de la responsabilité du fait personnel.",
    citation: "1240",
    relevant: true,
  },
  {
    question: q("force-obligatoire"),
    answer:
      "Non : les contrats légalement formés tiennent lieu de loi aux parties, qui ne peuvent s'y soustraire unilatéralement.",
    citation: "1103",
    relevant: true,
  },
  {
    question: q("negociation-bonne-foi"),
    answer:
      "Oui, la liberté de négocier doit s'exercer de bonne foi ; une rupture fautive engage la responsabilité de son auteur.",
    citation: "1112",
    relevant: true,
  },
  {
    question: q("dol"),
    answer:
      "Il s'agit d'un dol par réticence : la dissimulation intentionnelle d'une information déterminante vicie le consentement.",
    citation: "1137",
    relevant: true,
  },
  {
    question: q("imprevision"),
    answer: "La partie lésée peut demander une renégociation au titre de l'imprévision.",
    citation: "1195",
    relevant: true,
  },
  {
    question: q("inexecution-dommages"),
    answer:
      "Le débiteur est condamné au paiement de dommages et intérêts pour inexécution du contrat.",
    citation: "1231-1",
    relevant: true,
  },
  {
    question: q("vie-privee"),
    answer:
      "Chacun a droit au respect de sa vie privée, ce qui interdit une telle publication sans autorisation.",
    citation: "9",
    relevant: true,
  },

  // --- Clearly irrelevant (right topic, wrong article) ---
  {
    question: q("faute-delictuelle"),
    answer:
      "L'auteur d'une faute ayant causé un dommage doit le réparer au titre de la responsabilité du fait personnel.",
    citation: "544",
    relevant: false,
  },
  {
    question: q("dol"),
    answer:
      "Il s'agit d'un dol par réticence : la dissimulation intentionnelle d'une information déterminante vicie le consentement.",
    citation: "1242",
    relevant: false,
  },
  {
    question: q("vie-privee"),
    answer:
      "Chacun a droit au respect de sa vie privée, ce qui interdit une telle publication sans autorisation.",
    citation: "1195",
    relevant: false,
  },
  {
    question: q("fait-des-choses"),
    answer:
      "Le gardien d'une chose répond du dommage qu'elle cause, au titre de la responsabilité du fait des choses.",
    citation: "1103",
    relevant: false,
  },

  // --- Subtle near-misses ---
  {
    // 1130 states the vices of consent exist; 1137 is the specific dol basis.
    // The answer merely names dol as a vice, so citing the generic 1130 is weak
    // but arguably on-point — labelled a near-miss TRUE. The key-authority
    // static judge (which only accepts 1137) will disagree here, which is
    // exactly the kind of judge weakness calibration is meant to surface.
    question: q("dol"),
    answer:
      "Il s'agit d'un dol, l'un des vices du consentement qui peut entraîner la nullité du contrat.",
    citation: "1130",
    relevant: true,
  },
  {
    // Custody-of-a-thing answer citing 1240 (personal fault): the fait des
    // choses regime (1242) is no-fault, so 1240 does NOT support this answer.
    question: q("fait-des-choses"),
    answer:
      "La responsabilité du gardien est engagée de plein droit du seul fait de la chose, sans qu'une faute personnelle soit exigée.",
    citation: "1240",
    relevant: false,
  },
];
