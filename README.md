# Retro Classic Games

Live at https://retroclassic.games

Nine classic handheld brick games in the browser: Snake, Brick Breaker, Brick Racer, Brick Stack, Pong, Tanks, Road Crossing, Invaders and Flappy. Daily challenge with a shared seed, local scoreboard, installable and works offline.
Plain HTML, CSS and JavaScript. No build step, no dependencies.


## Screen styles and sound

Every game renders through one engine (`js/lcd.js`) in three styles: 3D Bricks (default), Neon Arcade and Classic LCD, chosen under SETTING or at `/styles`. Games only set grid cells, so styles never change gameplay or scores. Code 1 is a game's own colour and codes 2-9 pick Neon colours. Sound is synthesised with Web Audio and follows the style: square-wave piezo beeps for Classic, a fuller arcade set for 3D, and filtered synth with echo for Neon.

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

## Lagos Life

The whole arcade is one listing in the Lagos Life Games app (Vatar Games SDK, https://lagoslife.app/developers/docs). The listing address is the home page, `https://retroclassic.games/`.

- `js/lagoslife.js` (on the home page and every game page) does nothing on the open web. When a page is framed it loads the SDK, and if `Vatar.init()` answers the page switches to Lagos Life mode: the player's pause/resume is honoured, and sharing, the world-board name prompt, the scoreboard and styles pages, the install button and links out of the frame are hidden. Moving between the menu and the games works as usual.
- Lagos Life gives a listing one leaderboard, so only daily challenge scores go on it (same game, level and speed for everyone that day). Other games end with a DAILY button. One score per 20 s counts, so a quick replay sends the higher score.
- The premium colour pack (gold, chrome, jade) is product `console_pack`, sold only inside Lagos Life and unlocked in every game. Create it with that id on the Vatar dashboard.
- `api/vatar.js` verifies the session and each purchase with the Vatar API, grants it, marks it delivered and keeps ownership in Redis. Set `VATAR_SECRET` (the `vtr_test_…` key) and, once approved, `VATAR_LIVE_SECRET` (`vtr_live_…`) in the Vercel project settings; for `vercel dev` put them in `.env.local`, which git ignores. The webhook and match results secrets are not used.
- `vercel.json` sends `Content-Security-Policy: frame-ancestors` for the Lagos Life and Naija Life domains instead of `X-Frame-Options`.

## Controls

| Action | Keyboard | On screen |
| --- | --- | --- |
| Move | Arrow keys or WASD | Yellow d-pad |
| Action (turbo, fire, boost, rotate, serve) | Space, Z or X | Blue button |
| Start / pause | Enter, P | START / PAUSE pills |
| Sound | M | SOUND chip |

High scores are saved in the browser with localStorage.
