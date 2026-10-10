# Competition workflow

## Contents

1. Intake and state
2. Rule lock
3. Topic and decision framing
4. Desk and qualitative research
5. Survey design
6. Pilot and fieldwork
7. Data and analysis
8. Insight and action
9. Visual system, report, and presentation
10. Defense and iteration

## 1. Intake and state

Inspect all available artifacts before proposing a rebuild. Classify each artifact as source, draft, derived output, or submission candidate. Record the current stage, provenance, owner, deadline, and unresolved decisions in `project.yaml`. If visual work is in scope, resolve `visual.mode`, audience, anonymity status, rights status, visual brief, and asset-ledger locations before creating assets.

For a takeover, issue a concise diagnostic:

- what is already credible and reusable;
- what is missing but recoverable;
- what is invalid and must be replaced;
- what cannot be repaired without new fieldwork or user input.

## 2. Rule lock

Resolve edition, group, track, region, and stage. Create a rule snapshot from official sources. Mark every rule with authority, publication date, verification date, and scope. Never infer the next edition from the previous edition without a warning.

Gate: no hard compliance claim lacks a scoped source.

## 3. Topic and decision framing

Express the project as:

```text
decision owner + decision to make + affected population + evidence gap + expected action
```

Score candidate topics from 1 to 5 on:

- problem intensity and timeliness;
- identifiable decision owner;
- access to respondents and evidence;
- differentiation from common topics;
- ethical and operational feasibility;
- analytical depth without method forcing;
- actionability and measurable impact;
- narrative and defense potential.

Reject topics that depend on inaccessible populations, unverifiable claims, purely attitudinal novelty, or predetermined conclusions.

Gate: name the decision that changes if the study succeeds.

## 4. Desk and qualitative research

Use official statistics, policies, company materials, market data, and peer-reviewed research to map the context. Distinguish market facts from hypotheses.

Run exploratory interviews, expert interviews, observation, or focus groups when constructs and language are uncertain. Preserve recruitment, consent, date, mode, guide, notes or transcript, and coding decisions. Label unexecuted plans as proposed.

Produce a problem tree, stakeholder map, construct map, and preliminary mechanism model.

Gate: every survey construct has a documented rationale or exploratory source.

## 5. Survey design

Define target population, sampling unit, sampling frame, inclusion criteria, geography, and reference period. Choose probability sampling when a usable frame exists; otherwise state the non-probability design and limit inference.

Build an item matrix before the questionnaire:

| Research question | Construct | Variable | Item | Scale | Planned analysis | Decision use |
|---|---|---|---|---|---|---|

Use validated scales when suitable; document translation or adaptation. Add screening, attention, consistency, timing, and open-ended checks only when they serve a clear quality purpose.

Gate: every required item maps to analysis and every planned model variable is measured.

## 6. Pilot and fieldwork

Pilot comprehension, routing, response distribution, completion time, device compatibility, and preliminary reliability. Revise before full collection.

Document channels, quotas or strata, interviewer training, duplicate prevention, abnormal duration rules, straight-line rules, logical checks, callback or verification, and exclusion decisions. Preserve raw data unchanged; produce processed data separately.

Gate: fieldwork is reproducible and exclusion rules are defined before final analysis where possible.

## 7. Data and analysis

Create a data dictionary and cleaning log. Report missingness, duplicates, outliers, inconsistent responses, sample composition, and deviations from design. Use weights only with a defensible target distribution and disclose trimming or calibration.

Order analysis as:

1. data quality and sample description;
2. measurement quality;
3. research-question analysis;
4. model diagnostics and validation;
5. sensitivity or robustness checks;
6. limitations and external-validity boundary.

Choose methods through `methods-router.md`. Do not use a method merely because it appeared in a winning paper.

Gate: each reported result is reproducible from retained data and code or documented calculations.

## 8. Insight and action

Separate fact, interpretation, implication, and recommendation. Build an action table:

| Finding | Evidence strength | Affected segment | Action owner | Action | Priority | Cost/effort | KPI |
|---|---|---|---|---|---|---|---|

Prefer a small portfolio of specific actions over generic slogans. Include sequencing, dependencies, risks, and measurement.

Gate: every major action is evidence-linked and operationally owned.

## 9. Visual system, report, and presentation

Use the report to prove the full research chain. Use the PPT to communicate the decision story, not to miniaturize every report page. Keep titles, sample counts, variable names, coefficients, segments, findings, and recommendations synchronized.

Build the report and deck through separate but linked passes:

1. Freeze the fact registry, model registry, and output-linked evidence ledger.
2. Structure the report as problem -> design -> fieldwork/data credibility -> analysis ladder -> named insights -> action architecture -> limitations -> supporting evidence.
3. Identify one mother insight and a small set of headline findings that a panel can accurately repeat.
4. Create a finding-action coverage map. Every main-deck finding must change a decision; every main recommendation must cite a finding.
5. Rebuild the deck around context/tension -> credible research -> differentiated findings -> named conclusions -> actions. Do not use the report table of contents as the slide plan.
6. Allocate the largest content block to non-obvious findings and mechanisms. Compress routine literature, formulas, and validity checks, but never hide a material design or inference limitation.
7. Give each slide one narrative job and a claim -> evidence -> implication structure. Use appendix or backup slides for detail that cannot remain legible at delivery size.

When the evidence supports it, test both a population or lifecycle segmentation and a context, category, region, or service segmentation. Do not invent personas for visual appeal. Reuse the same defensible segment system across findings, recommendations, deck, and defense so the work tells one cumulative story.

Resolve the output surface before styling:

- `agent_ui`: use the approved 证见 EVI-X mark, icon, and brand tokens;
- `public_promo`: use approved EVI-X identity and IP derivatives with a clear non-official position;
- `competition_submission`: use a neutral or project-specific visual system and exclude EVI-X branding whenever anonymity applies.

Complete the visual brief and tokens before producing final pages or slides. Keep editable sources in `design/source/`, approved exports in `design/exports/`, and delivery-ready visual files in `deliverables/visuals/`. Record each material asset's purpose, source or parent, generation method, prompt reference when applicable, rights status, human review, and anonymity status.

Build figures from verified data or calculations and preserve the mapping from visual encoding to evidence. Do not distort axes, areas, color scales, denominators, uncertainty, or segment sizes for visual impact. Use generated imagery for narrative or illustrative roles, not as evidence. Preserve an approved IP master when producing derivatives; use deterministic SVG or document-native elements for logos, charts, tables, and exact Chinese text.

Render the report and slides at their actual delivery size. Inspect hierarchy, legibility, contrast, whitespace, clipping, font fallback, image resolution, consistency, and three-second comprehension of each headline page.

Place reproducibility and supporting evidence in the appendix without hiding essential methodological limitations.

Gate: a reviewer can trace every headline claim and substantive visual to its method and evidence; rendered outputs are legible, rights-cleared, identity-consistent, and anonymity-safe.

## 10. Defense and iteration

Prepare one-sentence, 30-second, and two-minute explanations of the problem, design, strongest finding, method choice, limitation, and top recommendation. Practice hostile questions from `judge-playbook.md`.

After each review, maintain a defect log with severity, owner, fix, verification, and regression risk. Re-run audits and re-render affected visual outputs after material changes.

Gate: team members can explain the work without relying on memorized wording or hidden analyst support.
