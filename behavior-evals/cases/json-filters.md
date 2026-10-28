Our storefront needs some product queries. Each product's details live in the JSON field `specs` (for example `{ "color": "red", "rating": 9, "dims": { "w": 25 }, "shipping": { "weight_kg": 2 } }`). Write `queries.json` in the current directory: an object mapping each key below to a REST request path with its query string (starting `/items/products?`). Every query must return each product's `name`. Test each one against the instance.

- `red`: products whose color is red.
- `highly_rated`: products with a rating of 8 or more.
- `wide_and_light`: products wider than 20 (`dims.w`) that weigh under 5 kg (`shipping.weight_kg`).
- `blue_or_cheap`: products that are blue, or cost less than 20 (`price`).
- `unrated`: products that have no rating.
- `widths`: every product, sorted by name, with its name and its width returned as a field called `width`.
