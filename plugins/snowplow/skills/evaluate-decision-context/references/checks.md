# Reading the checks

`decision_eval.py check` writes `report.md`. What each number means and how far it goes.

## Without labels

- **Answer mix** (`share`): how often each answer is given. An answer nobody gets, or everyone gets, is a sign the question, the values or the context needs work.
- **Confident share**: answers with confidence at least 0.6. High confidence with poor outcome numbers means the model is sure and wrong; don't trust confidence until it's checked against outcomes.
- **Close calls** (choice): answers where the top two probabilities are within 0.2. Many close calls between the same two values usually means their descriptions overlap.
- **Fingerprints** (`mean_<attribute>`): average attributes per answer. Each answer's group should look different in the way its description says (for example `ready_to_buy` with more cart adds). If two answers look alike, the model isn't separating them.
- **Tokens and cost** per variant: what each context costs to send.

## Against outcomes

- **Yes/no questions**: AUC (does a higher probability go with the outcome happening; 0.5 is chance) and ECE (calibration error: how far stated probabilities are from observed rates). Compare `mean_p_true` with the outcome rate: a model predicting 10% when 1% happens needs recalibration before its probability is used as a score.
- **Choice questions**: each answer's outcome rate and lift against the average. `ready_to_buy` with 10x the purchase rate is evidence the answer means something; it isn't accuracy, since outcomes aren't right answers.

## Comparing variants

On the same anchors, the report shows how often answers change between variants and, for yes/no questions, the AUC difference with a 95% bootstrap interval. If the interval includes zero, say there's no clear difference. Rare outcomes make intervals wide: increase the sample or the span before concluding.

## LLM judge

`judge --score` gives agreement and Cohen's kappa between the model and the judge, overall and by the model's confidence. Use it to find where the model disagrees with a careful reader, not as accuracy. Have a person review a sample of disagreements.

## History

`history` reads `runs.jsonl` and puts every run side by side. The `changed` column says what each run changed against the one before: the question (`call.json`), the state (the state builder or its options), the Signals data (a different dataset run) or the model. Read the confidence grid row by row: an answer whose median confidence stays low across runs is where to look next, and a fix that moves the wrong answers shows up as a drop elsewhere. Close calls and the confident share are for the whole question. Outcomes are shown for the latest run only. Compare earlier runs with `check` on their answers files.

