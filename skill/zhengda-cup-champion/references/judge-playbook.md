# Judge and red-team playbook

## Panel lenses

### Statistical-method judge

Probe the target population, sampling frame, sample-size basis, nonresponse, weighting, missingness, validity, model assumptions, diagnostics, uncertainty, robustness, and inference boundary.

### Market-research judge

Probe decision relevance, respondent access, exploratory work, questionnaire wording, pilot changes, fieldwork authenticity, segmentation usefulness, and whether findings go beyond obvious common sense.

### Enterprise or policy judge

Probe action owner, feasibility, cost, priority, risk, expected benefit, implementation sequence, KPI, and why the recommendation beats alternatives.

### Integrity and compliance judge

Probe raw-data provenance, exclusions, consent, privacy, citations, prior submissions, anonymity, map use, AI use, and consistency across files.

### Visual-communication judge

Probe whether hierarchy supports the decision story, every chart encodes verified evidence truthfully, text and contrast survive actual delivery size, generated imagery is clearly illustrative, asset rights and AI provenance are documented, and `visual.mode` is one of `agent_ui`, `public_promo`, or `competition_submission` with matching controls.

## High-pressure questions

1. What exact decision would change because of this study?
2. Why is your achieved sample allowed to support this population claim?
3. Show how the sample size was determined.
4. What changed after the pilot?
5. How many responses were excluded and under rules decided when?
6. Which result would disappear under a reasonable alternative specification?
7. Why did you choose this model instead of a simpler one?
8. What evidence supports the causal wording in this slide?
9. How stable and actionable are the segments?
10. Which recommendation has the highest evidence-to-cost ratio?
11. What is the largest limitation, and how does it change the recommendation?
12. Reproduce the headline number from raw data.
13. Where did AI contribute, and what did the team independently verify?
14. What would you do differently with two more weeks?
15. Why should an enterprise or government actor trust and adopt this work?
16. Reproduce the evidence and transformation behind the most prominent chart.
17. Which visual could be misread, and what design choice limits that risk?
18. Why does the narrative metaphor clarify the decision rather than decorate it?
19. What are the source, rights status, generation method, and human review for each non-data visual?
20. Show that the rendered submission contains no prohibited identity signal, including metadata and hidden layers.
21. For this headline percentage, name the target population, analysis sample, numerator, denominator, branch condition, exclusions, and every place it appears.
22. Why do the cluster or class counts sum to this model sample rather than the valid-questionnaire total?
23. Run the appendix code and show that its algorithm class, data object, feature list, sample, parameters, and output are the ones named in the report.
24. If this is KANO, show the paired functional/dysfunctional item and evaluation matrix. If it is LPA, show the real-data fit table and stability checks.
25. Is this number observed, inferred, simulated, or proposed? Which words in the report and deck preserve that boundary?
26. Show the exact statistical test for the claimed subgroup difference; “significant here, non-significant there” is not enough.
27. Why is this bin edge a genuine threshold rather than a questionnaire category boundary?
28. Prove that the approved PDF/PPT hash, page/slide count, metadata scan, and rendered review still describe the file you will upload.

## Red-team protocol

For experience-informed rehearsal, follow `defense-learning.md`. Bind each answer to current project evidence, inspect the premise of quantitative questions, and invalidate answers when linked inputs change. A completed practice form is not evidence verification or a passed Gate.

1. Review the raw artifacts, not only the summary.
2. Identify disqualifying or truth-integrity risks first.
3. Trace five headline claims end to end.
4. Recompute a representative sample of figures.
5. Compare questionnaire, variable dictionary, raw data, code, tables, report, PPT, script, and appendix for semantic and numeric contradictions.
6. Verify that every named model matches the executed library class, bound dataset, features, sample, output, and documented validation.
7. Render report and PPT outputs; inspect headline pages at delivery size and thumbnail size for hierarchy, legibility, clipping, misleading encoding, identity leakage, and IP consistency.
8. Check material visual assets against their ledger for parent/source, prompt reference, rights, AI disclosure, approval, and anonymity status.
9. Run the strict binary submission audit on the exact frozen output, then compare its hash and pagination to the human-reviewed render.
10. Ask the hardest unanswered question from each panel lens.
11. Score with `scoring-rubric.md` and apply caps.
12. Produce fixes with owner, effort, impact, deadline, and regression check.

Classify defects as `fatal`, `high`, `medium`, or `low`. Do not bury a fatal design flaw under presentation polish.
