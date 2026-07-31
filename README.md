# PokeMMO Breed Planner

Static GitHub Pages app to plan and estimate PokeMMO breeding routes.

## What It Does

- Plans a breeding path for selected perfect IV stats.
- Compares crafting tiers vs buying pre-built IV breeders.
- Supports hidden ability expected-cost modeling.
- Supports nature lock cost handling.
- Renders a visual breeding tree.
- Tracks real purchases and compares them against planned total cost.
- Saves everything in localStorage so your plan persists between sessions.

## Files

- `index.html`: App UI layout.
- `styles.css`: Visual design and responsive styling.
- `app.js`: Optimizer logic, tree rendering, and purchase tracking.

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

- Hidden ability calculations use expected value based on your configured chance.
- Item usage assumptions are shown in the app and can be tuned by changing input costs.
- Market shortcuts by IV tier are optional and only used if they are cheaper.