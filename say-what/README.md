# Say What? — portal pictures and square final

Host the game from this directory on GitHub Pages. Players join by the host QR code; open the separate TV link for the shared display. One device is assigned to each team and reconnects retain its slot.

The private picture portal is at https://burtco-picture-portal.burtonio.chatgpt.site/ . Upload a picture with its phrase as the filename. The mapping option removes its extension, leading numeric prefixes, and trailing `(Artwork 1)` / `(Artwork 2)` markers. Edit the answer when needed. Set the same optional duplicate group for equivalent phrases with different wording. Choose **Sync ready pictures to game** to copy ready pictures and mappings into the playable collection. Drafts are excluded. The game needs at least 11 unique phrases. A running room retains its chosen deck; new games fetch the latest synced collection.

## Rules

- Exactly 10 first-stage rounds. The host reveals the complete picture and opens all team buzzers together. First valid buzz gets the guess. A correct answer scores 10 points; a wrong answer locks that team out for that picture.
- The highest-scoring teams qualify. Default is two, adjustable before starting. Ties at the qualifying cutoff advance together. Scores carry forward.
- One fresh picture is concealed behind 12 squares in the final. The active finalist is the only team whose buzzer is enabled. Squares flash one at a time in a shuffled order at the selected speed (120 ms by default). Buzzing stops on the square highlighted by the host when the buzz arrives, removes that one square, and pauses for the team's guess. Correct scores 25 points. Wrong automatically passes the turn and restarts the highlight for the next finalist. No square is removed twice.
- If every square is uncovered, each finalist gets one last guess. A tied overall score triggers an unused-picture tie-break. If the collection is exhausted, tied winners share the win.
- The host judges answers. Private answer access is a deliberate host-only disclosure control. TV and player broadcasts omit future clues and unrevealed answer text.

Selection is a Fisher–Yates shuffle of duplicate groups. Both normalised answer text and exact image SHA-256 checksums connect duplicates, including transitive matches. Optional duplicate groups connect different wordings. Only one random artwork per connected duplicate group is used in a game, including its final and tie-breaks.

## Source and checks

`engine.mjs` contains the state transitions and duplicate grouping. `game.js` connects them to the host, TV, phone UI and Supabase Realtime. Run `node engine.test.mjs` for 50 full game simulations plus square exhaustion, cutoff ties, scoring, stale/double buzz rejection, and safe broadcast checks.

The portal source and the authenticated publishing bridge source are stored in the existing Picture Portal source repository. The bridge uses the `burtco-say-what-pictures` R2 bucket and the `burtco-say-what-library` Cloudflare Worker. Portal runtime configuration is `GAME_LIBRARY_URL` plus secret `GAME_SYNC_KEY`; the public bridge uses secret `SYNC_KEY`. Secrets never belong in this GitHub repository or in browser code.
