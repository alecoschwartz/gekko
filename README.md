# Gecko

A party game for phones. Everyone gets the secret word except one player, the Gecko. Answer questions, vote out the Gecko, and see if the Gecko can guess the word.

**Play:** https://alecoschwartz.github.io/gekko/

One person taps **Start a new room** and gets a 4-letter code like `FROG`. Everyone else opens the same page, types their name and the code, and joins. The host's phone runs the game, so keep it open while you play.

Phones pass messages through a free public MQTT relay (broker.emqx.io, falling back to broker.hivemq.com if it can't be reached) over a secure web connection. There's no server or database of our own, and the site is plain static files.

## Goggle

The host can switch the lobby to **Goggle**, a Boggle-style word hunt. Everyone gets the same 4×4 or 5×5 grid and finds words by swiping, tapping tiles, or typing. Two modes:

- **First to find it:** each word can only be claimed once, and everyone's lists show live, longest first.
- **Everyone finds their own:** lists are revealed at the end. Optionally, words more than one person found cancel out.

The host can also set the shortest word allowed (3–5 letters) and whether a word may reuse a tile. Each player can rotate the board on their own phone. Results show the best (longest) word anyone found.

Words are checked on the host's phone against the ENABLE word list (public domain), in `data/words.txt`, with a few slurs removed.

## Fibber

A bluffing trivia game. Everyone sees a strange-but-true fact with a blank, writes a fake answer, then votes for the one they think is real. +2 for finding the truth, +1 for each player your fib fools. The 1,500+ facts are in `js/fibs.js`, each with the source it was checked against.

**Quibber** is a setting inside Fibber (Answers: Funniest answer). Same flow, but the prompts have no right answer: everyone writes something funny and votes for their favorite. +1 per vote, +2 bonus if everyone else picks yours. The prompts are in `js/quibs.js`.

**Bot answers** (None/1/2/3, default 2) mix computer-written answers into the vote: plausible fake answers in Fibber (`js/fibbots.js`, 3 per question) and jokes in Quibber (`js/quibbots.js`, 3 per prompt). Voting for a bot scores nothing. A bot answer that matches a player's answer is skipped.

## Scraps

Pictionary with cut-out pieces. Players take turns building a secret word (picked from two options) out of shapes and a few body-part/symbol stickers: drag to move, handles to resize and rotate, tap to recolor, flip, copy or layer. Everyone else watches it come together live and types guesses; near misses say "so close" privately, and one letter of the word appears halfway through. Guessers score 3/2/1 by order, the builder 1 per correct guesser. Words and pieces are in `js/scraps.js`.

**Build with: Pen** turns it into plain Pictionary: draw with 12 colors, an eraser and 4 pen sizes. In both modes the pad is bigger than the screen: pinch (or the −/+ buttons) to zoom out, drag with two fingers (or on empty space, with pieces) to move around. Watchers' screens zoom to fit whatever has been drawn. The builder sees the latest guesses under the picture and can give each a 👍 (warmer) or 👎 (colder), which the guessers see.

While dragging or drawing, the builder's phone only updates the piece or stroke being moved, and sends the picture to everyone else about every 0.7 s (and immediately on release), so watchers see it move in small jumps.
