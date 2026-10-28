We run a ticketing backend for several client orgs on Directus. Users belong to orgs through the `memberships` collection (user, org, level), which our signup app manages, so keep its structure and data as they are. One user can be an admin in one org and only a viewer in another. Set up access for alice@example.com, bob@example.com, and carol@example.com, and make it work the same way for users we add later with a membership. They use our own frontend through the API, not the Studio.

- A member sees the tickets of every org they belong to, and nothing from other orgs.
- Org admins can create and edit tickets, but only in the orgs where they're admin. Viewers can't create or edit tickets.
- Only Directus admins can delete tickets.
- Members can't change memberships.
