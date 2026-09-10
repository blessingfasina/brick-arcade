# Brick Arcade

Four classic handheld brick games in the browser: Snake, Brick Breaker, Brick Racer and Brick Stack.
Plain HTML, CSS and JavaScript. No build step, no dependencies.

## Run locally

```bash
npx -y serve -l 3333 .
```

Then open http://localhost:3333.

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
| Action (turbo, fire, boost, rotate) | Space, Z or X | Blue button |
| Start / pause | Enter, P | START / PAUSE pills |
| Sound | M | SOUND chip |

High scores are saved in the browser with localStorage.
