---
name: docs-first
description: Documentation-first workflow for KameOps. Use before implementing any feature: read docs/README.md and the relevant spec (product/user-flows, reference/feature-specifications, database/schema, reference/application-inventory) so implementation matches requirements.
---

# Docs-First Skill

Before writing code for a feature, always consult the project documentation.

## When to Use

- Before implementing a new feature or flow
- When asked to add or change behavior that touches users, API, or data
- When unsure where a feature lives or how it should work

## Steps

1. **Open the index**: Read or reference `docs/README.md` to find the right doc for the topic (auth, organizations, properties, forms, bookings, payments, calendar, subscriptions, public UI).

2. **Current state**: Check `docs/reference/application-inventory.md` for existing routes, features, components, API, and DB.

3. **Read the flow**: Check `docs/product/user-flows.md` for the section that describes the user journey, permissions, and edge cases.

4. **Read the spec**: Check `docs/reference/feature-specifications.md` for the same feature: endpoints, input/output schemas, validation, and error handling.

5. **Check the schema** (if the feature touches data): Use `docs/database/schema.md` for tables, relations, and constraints.

6. **Check the roadmap**: Use `docs/implementation/roadmap.md` to confirm the feature is in scope for the current phase.

## Key Doc Paths

| Topic         | Primary doc                         | Also check                                          |
| ------------- | ----------------------------------- | --------------------------------------------------- |
| Auth          | reference/feature-specifications §1 | product/user-flows §1                               |
| Organizations | reference/feature-specifications §2 | database/schema §2, reference/application-inventory |
| Properties    | reference/feature-specifications §3 | database/schema §3, architecture/project-structure  |
| Forms         | reference/feature-specifications §4 | form-builder skill                                  |
| Bookings      | reference/feature-specifications §5 | product/user-flows §5, database/schema §5           |
| Payments      | reference/feature-specifications §6 | product/user-flows §7, database/schema §6           |
| Calendar      | reference/feature-specifications §7 | product/user-flows §6, database/schema §7           |
| Subscriptions | reference/feature-specifications §8 | product/user-flows §8, database/schema §8           |
| Public UI     | product/public-ui.md                | architecture/project-structure, public-ui skill     |

## Rule

Do not implement a feature from memory or assumption. Always align with the docs above; if something is missing or unclear, note it and follow the closest documented behavior.
