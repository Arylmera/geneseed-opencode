# Loop — Add widget

do it

The block below belongs to the engine. You may change `preset` (prudent, balanced, aggressive) or `contracts`: they apply from the next score on.

<!-- loop-state:begin -->
```json
{
  "v": 1,
  "title": "Add widget",
  "requirement": "do it",
  "preset": "balanced",
  "contracts": [],
  "graph": {
    "name": "tdd",
    "description": "Plan the work, then build it test-first: each iteration writes a failing test, makes it pass, and reviews the diff, until the plan is complete.",
    "category": "tests",
    "nodes": [
      "plan",
      "identify",
      "red-test",
      "apply",
      "test",
      "review"
    ],
    "start": "plan",
    "edges": [
      {
        "from": "plan",
        "on": "pass",
        "to": "identify"
      },
      {
        "from": "identify",
        "on": "more",
        "to": "red-test"
      },
      {
        "from": "identify",
        "on": "done",
        "to": "$close"
      },
      {
        "from": "red-test",
        "on": "red",
        "to": "apply"
      },
      {
        "from": "red-test",
        "on": "green",
        "to": "test"
      },
      {
        "from": "red-test",
        "on": "untestable",
        "to": "$stop"
      },
      {
        "from": "apply",
        "on": "pass",
        "to": "test"
      },
      {
        "from": "test",
        "on": "pass",
        "to": "review"
      },
      {
        "from": "test",
        "on": "fail",
        "to": "apply"
      },
      {
        "from": "review",
        "on": "pass",
        "to": "identify"
      },
      {
        "from": "review",
        "on": "fail",
        "to": "apply"
      }
    ],
    "loops": [
      {
        "name": "iterations",
        "nodes": [
          "identify",
          "red-test",
          "apply",
          "test",
          "review"
        ],
        "max": 20,
        "iteration": true
      },
      {
        "name": "apply-test",
        "nodes": [
          "apply",
          "test"
        ],
        "max": 2
      },
      {
        "name": "review-fix",
        "nodes": [
          "apply",
          "test",
          "review"
        ],
        "max": 3
      }
    ]
  },
  "node": "plan",
  "status": "running",
  "awaiting": null,
  "reason": null,
  "iteration": 0,
  "card": null,
  "validated": false,
  "pendingVerify": false,
  "closing": false,
  "counters": {},
  "resplit": false,
  "emptyStreak": 0,
  "snapshot": "",
  "visited": [],
  "tests": "n/a",
  "current": {},
  "notes": [],
  "history": [],
  "gateAmends": {}
}
```
<!-- loop-state:end -->
