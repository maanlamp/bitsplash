== pickup_tutor ==
# speaker: Quartermaster
# font: doublehomicide
{quest_pickup_tour == "active": -> pt_in_progress}
{quest_pickup_tour == "return": -> pt_return}
{quest_pickup_tour == "complete": -> pt_done}
-> pt_offer

= pt_offer
{pt_offer == 1:
    You move well, but you're walking past power you don't understand. Let me show you the gear scattered around here. Want to learn it?
    ~ start_quest("pickup_tour", "offered")
- else:
    Still want me to walk you through the gear?
}
+ [Accept] -> pt_accept
+ [Decline] -> pt_decline
+ [Leave] -> END

= pt_accept
~ begin_pickup_tour()
~ advance_quest("pickup_tour", "active")
-> pt_loop

= pt_loop
~ temp t = next_pickup()
{t == "": -> pt_wrap}
{t == "extra-jump": This one grants an extra jump in mid-air. Tap again at the apex and you'll vault higher than any wall expects.}
{t == "wall-slide": Grab this and you'll cling to walls, sliding down slow instead of dropping like a stone. Buys you a breath to think.}
{t == "wall-jump": With this you kick off walls. Slide, then leap the other way - chain them to climb shafts with no floor at all.}
{t == "speed-up": Pure pace. Pick it up and you'll outrun anything on these roads, and clear gaps that look impossible.}
+ [Next] -> pt_loop

= pt_wrap
~ end_pickup_tour()
Got all that? Good, now collect them.
-> END

= pt_decline
~ decline_quest("pickup_tour")
Suit yourself. The gear will keep until you wise up.
-> END

= pt_in_progress
The gear's still out there. Go on, collect it.
-> END

= pt_return
You found every piece. Good. Here - you've earned an extra spring in your step.
+ [Leave]
    ~ advance_quest("pickup_tour", "complete")
    -> END

= pt_done
You've got the feel for it now. Use it well.
-> END
