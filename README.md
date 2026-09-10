# Retro Classic Games

Live at https://retroclassic.games

Nine classic handheld brick games in the browser: Snake, Brick Breaker, Brick Racer, Brick Stack, Pong, Tanks, Road Crossing, Invaders and Flappy. Daily challenge with a shared seed, local scoreboard, installable and works offline.
Plain HTML, CSS and JavaScript. No build step, no dependencies.

## Run locally

```bash
npx -y serve -l 3333 .
```

Then open http://localhost:3333.

SEO files: `sitemap.xml`, `robots.txt`, per-page canonical tags and JSON-LD. `vercel.json` redirects the old `.vercel.app` host and `www` to the apex domain.

## Deploy to Vercel

Option A, from the terminal:

```bash
npx vercel
```

Option B, from GitHub: push this folder to a repository, then import it at https://vercel.com/new.
Vercel detects it as a static site. `vercel.json` turns on clean URLs so `/snake` serves `snake.html`.

## Controls

| Action | Keyboard | On screen |
| --- | --- | --- |
| Move | Arrow keys or WASD | Yellow d-pad |
| Action (turbo, fire, boost, rotate, serve) | Space, Z or X | Blue button |
| Start / pause | Enter, P | START / PAUSE pills |
| Sound | M | SOUND chip |

High scores are saved in the browser with localStorage.
