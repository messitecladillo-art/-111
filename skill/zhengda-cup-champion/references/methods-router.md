# Research and methods router

## Contents

1. Design before method
2. Question-to-method routes
3. Measurement and sampling checks
4. Minimum method contracts
5. Model validation
6. Claim language and the fact ledger

## 1. Design before method

Choose methods only after fixing the decision question, unit of analysis, outcome, predictors, measurement level, sampling design, sample size, and intended inference. Prefer the simplest method that answers the question with defensible assumptions.

## 2. Question-to-method routes

| Research need | Candidate methods | Required checks | Common misuse |
|---|---|---|---|
| Describe prevalence or structure | Weighted proportions, means, confidence intervals, cross-tabs | Sampling design, weights, uncertainty | Reporting only percentages without denominator |
| Compare groups | t/Wilcoxon, ANOVA/Kruskal-Wallis, chi-square, adjusted regression | Independence, distribution, multiplicity, effect size | Equating significance with importance |
| Identify associated drivers | Linear/GLM/ordinal/logistic regression, SEM when theory and measurement justify | Collinearity, functional form, diagnostics, measurement validity | Calling association causal |
| Segment respondents | Hierarchical/K-means, mixture or latent class models | Scaling, stability, interpretability, segment size | Naming unstable clusters as real markets |
| Measure latent constructs | Reliability, EFA, CFA, IRT where suitable | Item quality, dimensionality, fit, discriminant validity | Alpha-only validity claims |
| Model choices or trade-offs | Conjoint, discrete choice, MaxDiff | Experimental design, task burden, holdouts | Using ratings as revealed demand |
| Predict behavior | Regularized models, trees/boosting, calibrated classifiers | Train/test separation, leakage, calibration, class imbalance | Presenting in-sample accuracy |
| Analyze text | Human coding, dictionary methods, topic/sentiment models | Sampling, annotation protocol, validation, context | Treating model labels as ground truth |
| Evaluate change or impact | Randomized design, DiD, matching/weighting, interrupted time series | Identification assumptions, pre-trends, overlap, sensitivity | Causal wording from one cross-section |
| Prioritize actions | IPA with caution, NCA, portfolio matrices, cost-impact scoring | Construct validity, uncertainty, operational feasibility | Turning quadrants into proof |

## 3. Measurement and sampling checks

- Define the target population and the achieved sample separately.
- Report sampling frame coverage and recruitment channels.
- Justify sample size using estimation precision, design effect, model complexity, or power as appropriate.
- Do not use the observed sample distribution as proof of representativeness.
- Distinguish quota controls from probability sampling.
- If any terminal recruitment step is convenience, volunteer, intercept, snowball, or platform self-selection, treat the achieved sample as non-probability unless a defensible probability mechanism is demonstrated. Do not attach a simple-random-sample margin of error or population-representative wording to it.
- Register the target population, achieved sample, analysis-specific sample, numerator, denominator, unit, exclusions, and branch condition for every headline number.
- Document scale source, adaptation, reverse items, scoring, and missing-data handling.
- Report effect sizes and uncertainty, not only p-values.

## 4. Minimum method contracts

A method name is a promise about design and evidence. If the following minimum contract is absent, rename the analysis more modestly or do not use the method claim.

| Method or claim | Minimum contract before use |
|---|---|
| KANO | Paired functional and dysfunctional items, the KANO evaluation matrix, category counts, handling of questionable/reverse responses, and Better/Worse or equivalent calculations when used |
| K-means or other hard clustering | Exact model sample, features, preprocessing, distance, candidate K values, selection rule, random seed, cluster-size sum, stability or resampling check, and interpretable profiles |
| Latent profile/class analysis | Real-data input, estimator and software, candidate class range, AIC/BIC or related fit values, entropy/AvePP, class sizes, local-independence assessment, reproducible syntax, and sensitivity to starts/specification |
| Predictive or machine-learning model | Algorithm identity, target and feature dictionary, leakage prevention, train/validation/test separation, baseline, performance and calibration, uncertainty, code/environment, and an out-of-sample result |
| Mediation or “complete explanation” | Explicit mediator model, indirect effect, uncertainty interval or bootstrap, temporal/causal limits, and no substitution of subgroup comparisons for mediation |
| U-shaped or inverted-U relationship | Nonlinear term or suitable spline/segmented model, turning point, uncertainty, domain coverage on both sides, and robustness checks; a signed correlation is insufficient |
| IPA or derived importance | Independently justified performance and importance measures. Do not regress an outcome mechanically built from the same inputs and call the coefficients true drivers |
| AHP or expert weights | Named decision context, expert roles and count, elicitation and aggregation procedure, matrix provenance, consistency result, and sensitivity. Consistency alone does not turn subjective weights into actual cost |
| Text sentiment/topic analysis | Platform, query, collection window, raw and deduplicated counts, inclusion rules, annotation sample, domain validation, model/version, and platform/privacy compliance |
| Scenario, simulation, or uplift estimate | Parameter source, baseline, formula, uncertainty or range, scenario label, and a planned pilot. Never call an assumed result observed, validated, or realized |

Additional consistency rules:

- A method mentioned only in references, definitions, prior work, future suggestions, limitations, or an explicit non-use statement does not satisfy an implementation contract. Conversely, “based on prior work, this study used …” remains an actual-use claim and must satisfy the contract.
- Causal language requires a causal design actually implemented by this study; a heading, literature example, negated design, or subgroup/significance contrast is not an identification strategy.
- The named algorithm in prose, code, output object, chart, and appendix must be the same algorithm.
- Cluster or class counts must sum to the declared model sample after explicit exclusions.
- Questionnaire wording, variable dictionary, code mapping, table labels, and model inputs must have the same semantics.
- A non-significant or unsupported hypothesis is not “partially supported” unless a preregistered composite rule makes that status explicit.

## 5. Model validation

For each model record:

- purpose and target claim;
- input variables and preprocessing;
- assumptions and diagnostics;
- fit or performance metric;
- validation or sensitivity method;
- interpretation boundary;
- decision use.

Require out-of-sample validation for predictive claims. Require identification reasoning for causal claims. Require stability and practical interpretability for segmentation.

## 6. Claim language and the fact ledger

- Descriptive: “In the achieved sample...”
- Population estimate: use only with justified design/weighting and uncertainty.
- Associational: “X is associated with Y after adjustment...”
- Predictive: “The model predicts Y with ... on held-out data.”
- Causal: use only when design and assumptions support the effect.

Downgrade the language when the evidence is weaker than the desired claim.

Use `evidence/evidence-ledger.csv` as the canonical fact source for the report, PPT, abstract, and defense. For quantitative claims, populate `population`, `analysis_sample_n`, `numerator`, `denominator`, `unit`, and `reported_value`; classify every claim as `actual`, `inferred`, `simulated`, or `proposed`; list every output location. Run `check_traceability.py` before each frozen export so supported ratio/percentage-point arithmetic and explicit scenario-versus-realized conflicts are surfaced. Means, sums, money, coefficients, model outputs, and implicit semantic drift still require reproducible scripts and human review.

Use `unit=percentage_point` (or the alias `百分点`) for a change between two percentages. A percentage-point change is not one numerator/denominator ratio, so leave the single-pair fields blank. Register either both `baseline_numerator`/`baseline_denominator` and `current_numerator`/`current_denominator`, or both `baseline_value` and `current_value` (values are percentages from 0 to 100); the checker recomputes the difference. Keep the source columns and transformation explicit. Do not encode a percentage-point change as `percent`.
