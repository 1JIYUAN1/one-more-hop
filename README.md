# One More Hop / 见好就收

**One More Hop** is a one-button browser game about a small but consequential choice: after every three successful jumps, do you bank the score or risk it all for one more hop?

It is a portfolio project for game operations, product thinking, and interaction design. The game has no login, ads, payment, rewards, or external requests.

## Play loop

```text
hold to charge → release to jump → land on a platform → every 3 jumps: bank or continue
```

- A normal landing earns 10 points.
- Center landings build a precision streak and award 20 / 40 / 60 / 80 / 100 points; a normal landing resets the streak.
- A safe point appears every three jumps. Banking preserves the run score as the browser-local best record. Falling only clears the unbanked score.
- The first three jumps show a landing guide; from jump 10, some non-safe platforms move.

## Design question

The mechanic tests a simple hypothesis: **a clear loss boundary plus a voluntary cash-out decision can turn a basic jump loop into a meaningful risk-reward choice.**

This repository does not claim retention, playtime, or player-preference results. Those would require a defined target audience, instrumented gameplay data, and user research.

## Run and deploy

The `docs/` folder is ready for GitHub Pages. After deployment, the public game address will be:

`https://<your-github-username>.github.io/one-more-hop/`

For local static use, open `docs/index.html` in a modern browser. The game has no backend or npm dependency.

```bash
npm test
```

The test suite runs entirely in memory and requires Node.js 22 or newer.

## Controls

| Input | Action |
| --- | --- |
| Hold mouse / touch / `Space` | Charge |
| Release | Jump |
| `B` at a safe point | Bank score |
| `C` at a safe point | Continue the run |
| `R` after a run | Restart |
| `Esc` or tab switch | Pause |

Audio is off by default. A best score is stored only in the current browser’s local storage; the game gives a clear message if that storage is unavailable.

## Repository map

| Path | Purpose |
| --- | --- |
| `docs/index.html` | Accessible game UI and instructions. |
| `docs/game.js` | Canvas rendering, input, state transitions, audio, local best score, and pause behavior. |
| `docs/game-core.mjs` | Deterministic distance, landing, platform generation, checkpoint, and scoring rules. |
| `tests/game.test.mjs` | Tests for reachable platform generation, score rules, safe points, moving platforms, banking, loss, reset, and pause. |
| `.github/workflows/` | CI and GitHub Pages deployment. |

## AI collaboration disclosure

AI was used as a development collaborator for interface implementation, code drafting, test ideas, and copy alternatives. The project owner defined the core loop, the bank-or-continue rule, the scoring boundaries, the no-monetization constraint, and reviewed the implementation and test behavior. The game does not contain a runtime large-language-model feature.

## Presenting this project

> I designed a one-button prototype around the tension between immediate reward and voluntary risk control. I converted that idea into a testable loop: precision gains create short-term upside, safe points let players retain progress, and failure only affects unbanked points. I used AI to accelerate implementation and testing, while retaining the game-design constraints and reviewing behavior manually.

## License

[MIT](LICENSE)
