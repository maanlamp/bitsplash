// Overhead reaction barks. One stitch per member of REACTION_IDS, all under this
// single knot: gen-ink's emitNamespace walks one level of namedContent, so the
// generated Reactions.line record can only see stitches of one knot.
//
// The # emotion: tag mirrors the `emotion` column of the matching row in
// src/game/content/reactions/*.json. The table is what the runtime reads; the tag
// is what a dialogue portrait would read if one of these lines were ever spoken
// in a conversation. Keep the two the same.
//
// The # speaker: tag is likewise decorative for a bark: the real speaker is the
// entity that fires the reaction, read off its CharacterComponent. Name whichever
// character the row's `standings` column actually admits, so the two do not drift
// into contradicting each other.

== reactions ==
-> DONE

= rx_enemy_alert
# speaker: raider
# emotion: surprised
Oi! Over here!
-> DONE

= rx_enemy_taunt
# speaker: raider
# emotion: smug
Still breathing? Not for long.
-> DONE

= rx_npc_greet
# speaker: bramble
# emotion: happy
Ah, there you are.
-> DONE

= rx_npc_nod
# speaker: pennywhistle
# emotion: neutral
Traveller.
-> DONE

= rx_npc_wary
# speaker: stranger
# emotion: thinking
...And who might you be?
-> DONE

= rx_npc_startle
# speaker: stranger
# emotion: afraid
Aah! What was that?
-> DONE

= rx_npc_farewell
# speaker: bramble
# emotion: sad
Off again, then.
-> DONE

= rx_npc_cheer
# speaker: bramble
# emotion: curious
Back so soon?
-> DONE
