# Gecko

A party game for phones. Everyone gets the secret word except one player, the Gecko. Answer questions, vote out the Gecko, and see if the Gecko can guess the word.

**Play:** https://alecoschwartz.github.io/gekko/

One person taps **Start a new room** and gets a 4-letter code like `FROG`. Everyone else opens the same page, types their name and the code, and joins. The host's phone runs the game, so keep it open while you play.

Phones pass messages through a free public MQTT relay (broker.emqx.io) over a secure web connection. There's no server or database of our own, and the site is plain static files.
