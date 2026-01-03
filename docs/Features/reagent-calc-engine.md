# Reagent Calculation Engine — Contract (v1)

This document defines the contract for reagent calculation rules and the persisted payload
stored in `reagent_calculations.payload`. It is intentionally data-driven (no hardcoded lab numbers).

## 1) Goals

- Compute baseline reagent needs right after SampleTests are created (bulk).
- Recompute/adjust reagent usage when TestResults are submitted/updated and when SampleTest status changes.
- Keep payload and audit logs memory-safe (bounded size).
- Do not assume lab formulas; rules must be provided via DB JSON rules.

## 2) Terminology

- **Baseline:** initial computation after SampleTests exist for a Sample.
- **Adjustment:** recomputation caused by result changes, reruns, cancellations, or status changes.
- **Rule:** JSON config that defines how to compute reagent usage for a Method/Parameter scope.

## 3) Rule Resolution Order (Most Specific Wins)

When recalculating for a SampleTest (method_id, parameter_id):
1. Rule for (method_id + parameter_id)
2. Rule for (method_id only)
3. Rule for (parameter_id only)
4. No rule found => payload.state = "missing_rules"

## 4) Rule JSON Schema (stored in DB rule_json)

Top-level shape:

```json
{
  "schema_version": 1,
  "scope": { "method_id": 1, "parameter_id": 10 },
  "qc": {
    "blank_runs": 1,
    "control_runs": 0,
    "qc_runs": 0,
    "overage_pct": 10
  },
  "rounding": {
    "mode": "ceil",
    "precision": 2
  },
  "reagents": [
    {
      "reagent_code": "PCR_MIX",
      "unit": "uL",
      "formula": {
        "type": "per_test_volume",
        "value": 20
      }
    }
  ],
  "notes": "Rule is data-driven; formulas are examples only."
}
