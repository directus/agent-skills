---
'directus-agent-skills': patch
---

Compact every markdown table (no alignment padding) and turn router reference tables into lists: 13% fewer characters across skills, 8% in routers. The validator rejects padded tables.
directus-content-modeling: new existing-database reference (configure with PATCH, enums as choices plus field validation, what Directus can't use).
directus-content-modeling: both junction relations need `meta` (`one_field`, `junction_field`) for the Studio's M2M and translations interfaces.
