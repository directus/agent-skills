Our ops team runs the order desk in Directus. It's an internal tool, not a website: staff work in the Studio, and some scripts call the API directly. Set it up:

1. Two roles, `Ops` and `Manager`, both able to use the Studio.
2. Orders over $500 need a manager's approval before they can be fulfilled. Statuses are `new`, `approved`, `fulfilled`, `cancelled`. Only managers can approve. Record who approved an order and when (`approved_by`, `approved_at`).
3. Ops can see and update every order, but can't approve, and can't fulfill an order over $500 that isn't approved, whether they edit an existing order or create a new one. Managers can do everything ops can, plus approve.
4. A dashboard for ops with the number of orders waiting for approval and revenue per day for the last 30 days.

The rules must hold on the server, not just in the Studio.
