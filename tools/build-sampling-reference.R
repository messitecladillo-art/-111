# Reference values for apps/frontend/tests/sampling-methods.test.mjs.
# Requires R with the survey and sampling packages:
#   Rscript tools/build-sampling-reference.R
# The data are synthetic and generated here with a fixed seed; the JSON stores both the data and
# R's results so the JavaScript implementation can be checked against an independent one.
suppressMessages({ library(survey); library(sampling); library(jsonlite) })
options(survey.lonely.psu = "fail")
set.seed(20261014)
out <- list(versions = list(R = R.version.string, survey = as.character(packageVersion("survey")), sampling = as.character(packageVersion("sampling"))))

# 1. Stratified cluster design with unequal weights: 4 strata, 3-5 PSUs each, 4-12 records per PSU.
rows <- do.call(rbind, lapply(1:4, function(h) do.call(rbind, lapply(seq_len(sample(3:5, 1)), function(i) {
  m <- sample(4:12, 1); u <- rnorm(1, 0, 3)
  data.frame(h = paste0("S", h), psu = paste0("S", h, "-P", i), w = round(runif(m, 20, 120), 2),
             y = round(50 + 5 * h + u + rnorm(m, 0, 8), 3), dom = rbinom(m, 1, 0.55))
}))))
rows$yb <- as.integer(rows$y > 62)
d <- svydesign(ids = ~psu, strata = ~h, weights = ~w, data = rows, nest = TRUE)
m <- svymean(~y, d, deff = TRUE); t <- svytotal(~y, d)
mb <- svymean(~yb, d, deff = TRUE)
ci <- svyciprop(~yb, d, method = "logit", df = degf(d))
dm <- svymean(~y, subset(d, dom == 1), deff = TRUE)
jk <- as.svrepdesign(d, type = "JKn", mse = TRUE)
fpcN <- c(S1 = 9, S2 = 11, S3 = 8, S4 = 14)
rows$Nh <- fpcN[rows$h]
dfpc <- svydesign(ids = ~psu, strata = ~h, weights = ~w, fpc = ~Nh, data = rows, nest = TRUE)
out$complex <- list(rows = rows[, c("h", "psu", "w", "y", "yb", "dom")], fpc = as.list(fpcN),
  mean = list(estimate = as.numeric(coef(m)), se = as.numeric(SE(m)), deff = as.numeric(deff(m))),
  total = list(estimate = as.numeric(coef(t)), se = as.numeric(SE(t))),
  proportion = list(estimate = as.numeric(coef(mb)), se = as.numeric(SE(mb)), deff = as.numeric(deff(mb)), logit = as.numeric(as.numeric(attr(ci, "ci")))),
  domain = list(estimate = as.numeric(coef(dm)), se = as.numeric(SE(dm)), deff = as.numeric(deff(dm))),
  jackknife = list(mean = as.numeric(SE(svymean(~y, jk))), total = as.numeric(SE(svytotal(~y, jk)))),
  fpcMean = as.numeric(SE(svymean(~y, dfpc))), df = degf(d))

# 2. Two PSUs per stratum for BRR and Fay: totals must equal linearization exactly.
b2 <- do.call(rbind, lapply(1:6, function(h) do.call(rbind, lapply(1:2, function(i) {
  m <- sample(3:6, 1); data.frame(h = paste0("B", h), psu = paste0("B", h, "-", i), w = round(runif(m, 10, 60), 2), y = round(rnorm(m, 30 + 2 * h, 6), 3))
}))))
db <- svydesign(ids = ~psu, strata = ~h, weights = ~w, data = b2, nest = TRUE)
brr <- as.svrepdesign(db, type = "BRR", mse = TRUE); fay <- as.svrepdesign(db, type = "Fay", fay.rho = 0.5, mse = TRUE)
out$brr <- list(rows = b2, linearTotal = as.numeric(SE(svytotal(~y, db))), linearMean = as.numeric(SE(svymean(~y, db))),
  brrTotal = as.numeric(SE(svytotal(~y, brr))), brrMean = as.numeric(SE(svymean(~y, brr))), fayTotal = as.numeric(SE(svytotal(~y, fay))), fayMean = as.numeric(SE(svymean(~y, fay))))

# 3. One-stage cluster sample: all elements of 12 sampled clusters (out of 80) observed, unequal sizes.
cl <- do.call(rbind, lapply(1:12, function(i) { m <- sample(5:15, 1); u <- rnorm(1, 0, 4); data.frame(cl = paste0("C", i), y = round(20 + u + rnorm(m, 0, 5), 3)) }))
cl$N <- 80
dc <- svydesign(ids = ~cl, fpc = ~N, data = cl)
out$cluster <- list(rows = cl[, c("cl", "y")], N = 80, mean = as.numeric(coef(svymean(~y, dc))), se = as.numeric(SE(svymean(~y, dc))))

# 4. Two-stage sample with equal sizes: 8 of 40 PSUs, 6 of 30 elements in each.
ts <- do.call(rbind, lapply(1:8, function(i) { u <- rnorm(1, 0, 3); data.frame(psu = paste0("U", i), ssu = paste0("U", i, "-", 1:6), y = round(40 + u + rnorm(6, 0, 6), 3)) }))
ts$N <- 40; ts$M <- 30
dts <- svydesign(ids = ~psu + ssu, fpc = ~N + M, data = ts)
out$twoStage <- list(rows = ts[, c("psu", "y")], N = 40, M = 30, mean = as.numeric(coef(svymean(~y, dts))), se = as.numeric(SE(svymean(~y, dts))))

# 5. Stratified simple random sample with known stratum sizes.
st <- do.call(rbind, lapply(1:3, function(h) { n <- c(12, 9, 15)[h]; data.frame(h = paste0("H", h), y = round(rnorm(n, c(60, 75, 52)[h], c(8, 14, 6)[h]), 3), Nh = c(400, 250, 900)[h]) }))
dst <- svydesign(ids = ~1, strata = ~h, fpc = ~Nh, data = st)
out$stratified <- list(rows = st, mean = as.numeric(coef(svymean(~y, dst))), se = as.numeric(SE(svymean(~y, dst))), total = as.numeric(coef(svytotal(~y, dst))), totalSe = as.numeric(SE(svytotal(~y, dst))))

# 6. Ratio and regression (GREG) estimators under SRS with N = 500 and known mean of x.
x <- round(runif(25, 20, 80), 2); y <- round(3 + 1.8 * x + rnorm(25, 0, 9), 3)
sr <- data.frame(x = x, y = y, N = 500); dsr <- svydesign(ids = ~1, fpc = ~N, data = sr)
r <- svyratio(~y, ~x, dsr); Xbar <- 51.7
g <- calibrate(dsr, ~x, population = c(`(Intercept)` = 500, x = 500 * Xbar))
out$ratio <- list(rows = sr[, c("x", "y")], N = 500, Xbar = Xbar, R = as.numeric(coef(r)), seR = as.numeric(SE(r)),
  greg = as.numeric(coef(svymean(~y, g))), gregSe = as.numeric(SE(svymean(~y, g))))

# 7. Raking and post-stratification weights.
rk <- data.frame(sex = sample(c("M", "F"), 60, TRUE, prob = c(0.35, 0.65)), age = sample(c("18-29", "30-44", "45+"), 60, TRUE, prob = c(0.6, 0.3, 0.1)), w = 1)
dr <- svydesign(ids = ~1, weights = ~w, data = rk)
pop.sex <- data.frame(sex = c("M", "F"), Freq = c(510, 490)); pop.age <- data.frame(age = c("18-29", "30-44", "45+"), Freq = c(300, 350, 350))
raked <- rake(dr, list(~sex, ~age), list(pop.sex, pop.age), control = list(maxit = 200, epsilon = 1e-10))
ps <- postStratify(dr, ~age, pop.age)
out$weights <- list(rows = rk, sexTargets = setNames(as.list(pop.sex$Freq), pop.sex$sex), ageTargets = setNames(as.list(pop.age$Freq), pop.age$age),
  raked = as.numeric(weights(raked)), post = as.numeric(weights(ps)))

# 8. Inclusion probabilities for πps with certainty units (sampling package).
sizes <- c(820, 60, 75, 140, 33, 410, 95, 120, 64, 51, 230, 88)
out$pips <- list(sizes = sizes, n = 4, pik = inclusionprobabilities(sizes, 4))

# 9. Two-group sample sizes.
out$power <- list(prop = as.numeric(power.prop.test(p1 = 0.30, p2 = 0.45, power = 0.8)$n),
  mean = as.numeric(power.t.test(delta = 0.5, sd = 1, power = 0.8)$n))

write_json(out, "apps/frontend/tests/fixtures/sampling-reference.json", digits = NA, auto_unbox = TRUE, pretty = FALSE)
cat("wrote sampling-reference.json\n")
