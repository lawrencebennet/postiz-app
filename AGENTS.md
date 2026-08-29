# Agent instructions — Neptive / Postiz fork

This is **not** stock Postiz. Product customizations live on branch `neptive`.

1. Read [neptive/HANDOFF.md](neptive/HANDOFF.md) first.
2. Architecture: [neptive/NEPTIVE_ARCHITECTURE.md](neptive/NEPTIVE_ARCHITECTURE.md)
3. Allowed core edits only: [neptive/NEPTIVE_CORE_TOUCHPOINTS.md](neptive/NEPTIVE_CORE_TOUCHPOINTS.md)

Rules:

- Do not redesign Option B.
- Do not add Neptive columns to `Post`, `Integration`, or `User`.
- Do not edit Temporal `post.workflow.v1.0.x` files.
- Do not put client portal users on `UserOrganization`.
- New product code goes under `neptive/` path prefixes listed in HANDOFF.
- Never commit `.env`.
