# Say What? — BURTCO Pub Games

Live game: https://jamesburtondrums-ops.github.io/checkplant/say-what/

Static GitHub Pages game using the existing Wrong Hand Supabase Realtime connection. It uses separate `say-what-game:` room channels and does not alter Wrong Hand.

## Running an event

1. Open the game on the host computer. Each fresh visit creates a new room.
2. Choose a maximum of 2–32 teams and automatic or manual tile reveal.
3. Click **Open TV display** and display that tab on the TV. Teams scan its QR code; one device receives one team slot in joining order.
4. Start the game, then open buzzers for each picture. Teams answer aloud; host marks Correct or Wrong.
5. Correct scores 10 plus the number of covered tiles. Wrong locks that team out for that picture. Show answer reveals the clue without scoring. Next clue advances, and the last clue finishes the game.

The host tab must remain open and connected. Host state and device slots are restored on refresh in the same browser; buzzers are paused after a host refresh. Team devices re-register every two seconds. A connection timeout disables their buzzer until state returns.

## Assets and boundaries

20 original rebus compositions from OpenMoji 17.0.0 graphics, embedded in the HTML so picture loading does not depend on another image host. See ASSET_CREDITS.md for source URLs and CC BY-SA 4.0 attribution.

The app uses pinned Supabase JS 2.107.0 and QRCode 1.5.4 imports from jsDelivr. Internet access is needed on all devices.

This follows Wrong Hand's host-authoritative broadcast architecture. Rooms are casual pub-game rooms, not authenticated competitive game servers. The public HTML includes the clue bank, and people inspecting source can discover answers. Hosting is static; scores are not a central permanent event archive.

## Validation

Browser-tested host/team/TV synchronisation, registration, first buzz, scoring, wrong-answer lockout and host-refresh recovery. Buzzer logic checks also cover stale round IDs, unregistered device IDs and closed buzzers. Full 32-device load testing has not been performed.
