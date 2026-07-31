# PokeMMO Breed Shopping Planner

Static GitHub Pages app focused on a simple workflow:

1. Select target Pokemon.
2. Fetch egg groups and hidden ability data.
3. Choose desired IV stats.
4. Auto-generate a shopping list of breeders and required items.
5. Assign costs and mark rows as `Buy` or `Have`.

## Features

- Fetches Pokemon species data from PokeAPI.
- Displays target egg groups and hidden ability information.
- Suggests compatible parent species from the same egg groups.
- Builds a clear parent/item shopping list based on chosen IV stats.
- Includes hidden ability expected-quantity handling via configured HA chance.
- Lets you assign row-by-row costs and track buy total instantly.
- Saves state in localStorage.

## Files

- `index.html`: Simplified guided workflow UI.
- `styles.css`: Responsive styling.
- `app.js`: Data fetch, planning logic, and shopping calculations.

## Local Run

Open `index.html` directly, or run any static file server.

Example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

1. Push to your repository default branch.
2. In repo settings, open Pages.
3. Set Source to deploy from branch.
4. Choose `main` branch and `/ (root)`.
5. Save.

The site will publish from this folder.

## Notes About Estimates

- Hidden ability rows use expected quantity with $1 / p$ where $p$ is HA chance.
- Suggested parents are compatibility hints and should still be checked against your exact in-game strategy.