// ============================================================================
// Judge calibration gold set for LegalCiteEval.
//
// ILLUSTRATIVE / SYNTHETIC ONLY — NOT legal advice. Hand-labelled
// (question, answer, citation, relevant) tuples used to measure the reliability
// of a relevance judge: does the cited article actually support the GIVEN
// answer to the question?
//
// ── Why this is authored INDEPENDENTLY of the corpus keyAuthorities ──────────
// The offline demo judge (`questionKeyedStaticJudge`) keys relevance on each
// question's `expected.keyAuthorities`. If this gold set simply relabelled
// "relevant = is-a-keyAuthority", calibrating that judge against it would be
// CIRCULAR: the judge would be graded against its own signal and score ~100%
// by construction. That agreement number would measure nothing.
//
// So every `relevant` label below is hand-authored from legal reasoning about
// whether the article supports THIS answer — NOT copied from keyAuthorities.
// The set deliberately includes cases where the two diverge:
//   • near-miss authorities that genuinely support the answer but are NOT the
//     registered key authority  → an answer-blind, key-authority judge marks
//     them irrelevant (false negatives);
//   • the correct key article cited under an answer it does NOT actually
//     support (wrong legal claim, or off-point answer) → an answer-blind judge
//     still marks it relevant (false positives).
// A judge that only looks at (question, citation) therefore CANNOT get these
// right — relevance is a property of the answer. That is exactly the judge
// weakness calibration is meant to expose, and it is why the measured
// agreement is well below 100%.
//
// The `question` of each item is taken VERBATIM from ../scenarios/questions.ts
// (via `q(id)`) so the deterministic judge still recognizes the question text;
// only the RELEVANCE LABELS are decoupled from keyAuthorities. Every article
// used is in the public corpus subset (../corpus/corpus.ts).
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
  // ── Correct citation: the article is the genuine basis for the answer ──────
  {
    question: q("faute-delictuelle"),
    answer:
      "L'auteur d'une faute ayant causé un dommage doit le réparer au titre de la responsabilité du fait personnel.",
    citation: "1240",
    relevant: true,
    note: "1240 (responsabilité du fait personnel pour faute) is the correct basis.",
  },
  {
    question: q("force-obligatoire"),
    answer:
      "Non : les contrats légalement formés tiennent lieu de loi aux parties, qui ne peuvent s'y soustraire unilatéralement.",
    citation: "1103",
    relevant: true,
    note: "1103 states the binding force of contracts — squarely supports the answer.",
  },
  {
    question: q("negociation-bonne-foi"),
    answer:
      "Oui, la liberté de négocier doit s'exercer de bonne foi ; une rupture fautive engage la responsabilité de son auteur.",
    citation: "1112",
    relevant: true,
    note: "1112 governs good faith in precontractual negotiation — the key authority.",
  },
  {
    question: q("dol"),
    answer:
      "Il s'agit d'un dol par réticence : la dissimulation intentionnelle d'une information déterminante vicie le consentement.",
    citation: "1137",
    relevant: true,
    note: "1137 defines dol, including réticence dolosive — directly supports the answer.",
  },
  {
    question: q("imprevision"),
    answer: "La partie lésée peut demander une renégociation au titre de l'imprévision.",
    citation: "1195",
    relevant: true,
    note: "1195 is the imprévision article — the renegotiation remedy comes from it.",
  },
  {
    question: q("inexecution-dommages"),
    answer:
      "Le débiteur est condamné au paiement de dommages et intérêts pour inexécution du contrat.",
    citation: "1231-1",
    relevant: true,
    note: "1231-1 is the specific basis for contractual damages.",
  },
  {
    question: q("vie-privee"),
    answer:
      "Chacun a droit au respect de sa vie privée, ce qui interdit une telle publication sans autorisation.",
    citation: "9",
    relevant: true,
    note: "Article 9 protects private life — the correct authority.",
  },
  {
    question: q("fait-des-choses"),
    answer:
      "Le gardien d'une chose répond de plein droit du dommage qu'elle cause, au titre de la responsabilité du fait des choses.",
    citation: "1242",
    relevant: true,
    note: "1242 is the fait des choses regime — supports the custody-liability answer.",
  },

  // ── Irrelevant citation: a real corpus article on the wrong point ──────────
  {
    question: q("faute-delictuelle"),
    answer:
      "L'auteur d'une faute ayant causé un dommage doit le réparer au titre de la responsabilité du fait personnel.",
    citation: "544",
    relevant: false,
    note: "544 (droit de propriété) has nothing to do with delictual fault.",
  },
  {
    question: q("dol"),
    answer:
      "Il s'agit d'un dol par réticence : la dissimulation intentionnelle d'une information déterminante vicie le consentement.",
    citation: "1242",
    relevant: false,
    note: "1242 (fait des choses) is unrelated to a defect of consent.",
  },
  {
    question: q("vie-privee"),
    answer:
      "Chacun a droit au respect de sa vie privée, ce qui interdit une telle publication sans autorisation.",
    citation: "1195",
    relevant: false,
    note: "1195 (imprévision) is a contract-law article, irrelevant to privacy.",
  },
  {
    question: q("fait-des-choses"),
    answer:
      "Le gardien d'une chose répond du dommage qu'elle cause, au titre de la responsabilité du fait des choses.",
    citation: "1103",
    relevant: false,
    note: "1103 (binding force of contracts) does not support a tort-of-things answer.",
  },
  {
    question: q("force-obligatoire"),
    answer:
      "Non : les contrats légalement formés tiennent lieu de loi aux parties, qui ne peuvent s'y soustraire unilatéralement.",
    citation: "1240",
    relevant: false,
    note: "1240 (delictual fault) is not the basis for a contract's binding force.",
  },

  // ── Near-miss authority: genuinely supports the answer, but is NOT the ─────
  //    registered keyAuthority. An answer-blind, key-authority judge marks
  //    these NOT relevant → FALSE NEGATIVES that break circularity.
  {
    question: q("dol"),
    answer:
      "Il s'agit d'un dol, l'un des vices du consentement qui peut entraîner la nullité du contrat.",
    citation: "1130",
    relevant: true,
    note: "1130 enumerates the vices du consentement (incl. dol) and links them to nullity; it genuinely supports THIS answer, though the specific dol basis is 1137. keyAuthority for 'dol' is 1137, so the static judge disagrees (false negative).",
  },
  {
    question: q("negociation-bonne-foi"),
    answer:
      "La rupture des pourparlers est fautive car la bonne foi s'impose dès la phase de négociation du contrat.",
    citation: "1104",
    relevant: true,
    note: "1104 imposes good faith in negotiation, formation and performance; it directly grounds a good-faith-in-negotiation answer. keyAuthority is 1112, so the static judge disagrees (false negative).",
  },
  {
    question: q("inexecution-dommages"),
    answer:
      "Face à l'inexécution, le créancier dispose de plusieurs sanctions, dont le droit de demander réparation du préjudice subi.",
    citation: "1217",
    relevant: true,
    note: "1217 lists the creditor's remedies for non-performance, including obtaining reparation — it supports this answer. keyAuthority is the more specific 1231-1, so the static judge disagrees (false negative).",
  },

  // ── Right article, wrong answer: the CORRECT key authority cited under an ──
  //    answer it does NOT actually support. Relevance depends on the answer,
  //    which an answer-blind judge ignores → FALSE POSITIVES that break
  //    circularity (a key-authority judge cannot possibly get these right).
  {
    question: q("dol"),
    answer:
      "L'action se prescrit par cinq ans à compter de la découverte du vice ; passé ce délai, elle est irrecevable.",
    citation: "1137",
    relevant: false,
    note: "The answer is about the limitation period, not about what dol IS. 1137 defines dol; it does not support a claim about prescription. keyAuthority for 'dol' is 1137, so the answer-blind static judge wrongly marks it relevant (false positive).",
  },
  {
    question: q("faute-delictuelle"),
    answer:
      "La responsabilité est engagée de plein droit, sans qu'aucune faute de l'auteur n'ait à être prouvée.",
    citation: "1240",
    relevant: false,
    note: "1240 is fault-BASED liability; it does not support a 'no fault required / strict liability' answer. keyAuthority for 'faute-delictuelle' is 1240, so the answer-blind static judge wrongly marks it relevant (false positive).",
  },

  // ── Custody-of-a-thing answer citing personal fault (1240): fait des ───────
  //    choses (1242) is no-fault, so 1240 does not support it. Neither article
  //    is the keyAuthority here, so the static judge agrees (true negative).
  {
    question: q("fait-des-choses"),
    answer:
      "La responsabilité du gardien est engagée de plein droit du seul fait de la chose, sans qu'une faute personnelle soit exigée.",
    citation: "1240",
    relevant: false,
    note: "The fait des choses regime is no-fault, so 1240 (personal fault) does not support this answer.",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 5 — divergent cases on the HARD paraphrased questions (Phase 4). Same
  // de-circularization discipline: labels are legal judgements about the
  // ANSWER, authored independently of the corpus keyAuthorities, so the
  // answer-blind static judge keeps making genuine FN (near-miss) and FP
  // (right-article-wrong-answer) errors on this larger set too.
  // ══════════════════════════════════════════════════════════════════════════

  // ── Abus de dépendance (key authority 1143) ────────────────────────────────
  {
    question: q("violence-economique"),
    answer:
      "Oui : l'abus de l'état de dépendance pour obtenir un engagement assorti d'un avantage manifestement excessif est une violence qui vicie le consentement et permet l'annulation.",
    citation: "1143",
    relevant: true,
    note: "1143 is the abuse-of-dependence violence article — the exact basis.",
  },
  {
    question: q("violence-economique"),
    answer:
      "Oui, il s'agit d'une violence, l'un des vices du consentement, qui peut entraîner la nullité du contrat.",
    citation: "1130",
    relevant: true,
    note: "1130 enumerates the vices du consentement (incl. violence) and links them to nullity; it genuinely supports THIS answer. keyAuthority is the specific 1143, so the answer-blind static judge disagrees (false negative).",
  },
  {
    question: q("violence-economique"),
    answer:
      "Oui : l'abus de dépendance vicie le consentement et justifie l'annulation du contrat.",
    citation: "1103",
    relevant: false,
    note: "1103 (binding force of contracts) does not support an abuse-of-dependence / nullity answer. Static judge agrees (true negative).",
  },
  {
    question: q("violence-economique"),
    answer:
      "L'action en nullité pour ce vice se prescrit par cinq ans à compter du jour où la violence a cessé.",
    citation: "1143",
    relevant: false,
    note: "The answer is about the limitation period, not what the vice IS; 1143 defines the vice, it does not support a prescription claim. keyAuthority is 1143, so the answer-blind static judge wrongly marks it relevant (false positive).",
  },

  // ── Force majeure (key authority 1218) ─────────────────────────────────────
  {
    question: q("force-majeure"),
    answer:
      "Oui : un événement extérieur, imprévu et insurmontable échappant à son contrôle caractérise la force majeure et l'exonère de sa responsabilité.",
    citation: "1218",
    relevant: true,
    note: "1218 defines force majeure — squarely supports the exoneration answer.",
  },
  {
    question: q("force-majeure"),
    answer:
      "Oui, elle échappe à la condamnation à des dommages et intérêts, l'exécution ayant été empêchée par un tel événement.",
    citation: "1231-1",
    relevant: true,
    note: "1231-1 excuses contractual damages when performance was prevented by force majeure — it genuinely supports THIS answer. keyAuthority is 1218, so the answer-blind static judge disagrees (false negative).",
  },
  {
    question: q("force-majeure"),
    answer: "Oui, l'événement la libère de son obligation contractuelle.",
    citation: "544",
    relevant: false,
    note: "544 (droit de propriété) is unrelated to force majeure. Static judge agrees (true negative).",
  },
  {
    question: q("force-majeure"),
    answer:
      "Non : un tel événement ne libère jamais le débiteur, qui reste tenu d'exécuter son engagement.",
    citation: "1218",
    relevant: false,
    note: "The answer contradicts what 1218 provides (force majeure DOES exonerate); the article does not support a 'never freed' claim. keyAuthority is 1218, so the answer-blind static judge wrongly marks it relevant (false positive).",
  },
  {
    question: q("force-majeure"),
    answer:
      "Oui, l'événement de force majeure l'exonère de sa responsabilité contractuelle.",
    citation: "1112-1",
    relevant: false,
    note: "1112-1 (precontractual information duty) is unrelated to force majeure. Static judge agrees (true negative).",
  },

  // ── Devoir d'information précontractuel (key authority 1112-1) ──────────────
  {
    question: q("devoir-information"),
    answer:
      "Oui : celui qui connaît une information déterminante pour le consentement de l'autre doit l'en informer ; le taire méconnaît le devoir précontractuel d'information.",
    citation: "1112-1",
    relevant: true,
    note: "1112-1 is the precontractual information duty — the exact basis.",
  },
  {
    question: q("devoir-information"),
    answer:
      "Oui, et si la dissimulation de cette information déterminante était intentionnelle, elle constitue un dol par réticence.",
    citation: "1137",
    relevant: true,
    note: "1137 (dol, incl. réticence dolosive) covers the intentional concealment of a determinative information — it genuinely supports THIS answer. keyAuthority is 1112-1, so the answer-blind static judge disagrees (false negative).",
  },
  {
    question: q("devoir-information"),
    answer: "Oui, elle a manqué à son devoir d'information avant de conclure.",
    citation: "1195",
    relevant: false,
    note: "1195 (imprévision) is unrelated to a precontractual information duty. Static judge agrees (true negative).",
  },
  {
    question: q("devoir-information"),
    answer:
      "Oui, et ce devoir portait aussi sur l'estimation de la valeur de la prestation, qu'elle aurait dû révéler.",
    citation: "1112-1",
    relevant: false,
    note: "1112-1 expressly EXCLUDES the estimation of value from the information duty, so it does not support this answer. keyAuthority is 1112-1, so the answer-blind static judge wrongly marks it relevant (false positive).",
  },

  // ── Exécution forcée en nature (key authority 1221) ────────────────────────
  {
    question: q("execution-forcee"),
    answer:
      "Oui : le créancier peut poursuivre l'exécution forcée en nature de l'obligation, sauf impossibilité ou coût manifestement déraisonnable.",
    citation: "1221",
    relevant: true,
    note: "1221 is the forced-performance-in-kind article, with its cost exception — the exact basis.",
  },
  {
    question: q("execution-forcee"),
    answer:
      "Oui, poursuivre l'exécution forcée en nature figure parmi les sanctions ouvertes au créancier en cas d'inexécution.",
    citation: "1217",
    relevant: true,
    note: "1217 lists the creditor's remedies for non-performance, expressly including pursuing forced performance in kind — it genuinely supports THIS answer. keyAuthority is the specific 1221, so the answer-blind static judge disagrees (false negative).",
  },
  {
    question: q("execution-forcee"),
    answer: "Oui, il peut exiger l'exécution en nature de la prestation promise.",
    citation: "9",
    relevant: false,
    note: "Article 9 (privacy) is unrelated to forced performance. Static judge agrees (true negative).",
  },
  {
    question: q("execution-forcee"),
    answer:
      "Oui, et l'exécution forcée en nature s'impose toujours, quel qu'en soit le coût pour le débiteur.",
    citation: "1221",
    relevant: false,
    note: "1221 carves out an exception when the cost is manifestly unreasonable, so it does not support an 'always, whatever the cost' answer. keyAuthority is 1221, so the answer-blind static judge wrongly marks it relevant (false positive).",
  },
];
