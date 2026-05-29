---
name: credit-cards
description: Credit card SOA module for KameOps. Use when porting pay-credit-cards CLI logic.
---

# Credit Cards (Claude)

See full skill: `.cursor/skills/credit-cards/SKILL.md`

Key points:

- Port parsers from `automated-tasks/pay-credit-cards/src/`
- Banks: metrobank, rcbc, bpi, unionbank
- Preserve mark-paid and reminder fingerprint behavior
- Rule: `.cursor/rules/18-credit-cards-module.mdc`
