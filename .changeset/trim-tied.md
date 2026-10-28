---
"directus-agent-skills": minor
---

Cut directus-sdk and directus-environment-sync to their traps and commands, since models pass every eval case without them. Trim index, flow recipe, and loop references that only covered tasks models already get right. Document that Run Script can't follow a condition's reject path, and that UUID keys need `special: ["uuid"]`.
