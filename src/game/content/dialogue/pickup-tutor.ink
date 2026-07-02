== pickup_tutor ==
# speaker: Quartermaster
# font: cartridge
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
~ advance_quest("pickup_tour", "active")
~ start_cutscene("pickup-tour")
-> END

= pt_intro_walk
# speaker: Quartermaster
Come, walk with me.
-> DONE

= pt_intro
# speaker: Quartermaster
The wilds are littered with old gear. Watch close, I'll show you where it hides.
-> DONE

= pt_line_wall_slide
# speaker: Quartermaster
Grab this and you'll cling to walls, sliding down slow instead of dropping like a stone. Buys you a breath to think.
-> DONE

= pt_line_wall_jump
# speaker: Quartermaster
With this you kick off walls. Slide, then leap the other way - chain them to climb shafts with no floor at all.
-> DONE

= pt_line_dash
# speaker: Quartermaster
Pure burst. Slam it and you'll lunge forward faster than anything can track - across gaps that swallow careful jumpers.
-> DONE

= pt_line_extra_jump
# speaker: Quartermaster
This one grants an extra jump in mid-air. Tap again at the apex and you'll vault higher than any wall expects.
-> DONE

= pt_wrap
# speaker: Quartermaster
Got all that? Good, now collect them.
-> DONE

= pt_smooch
# speaker: You
# font: comicoro
Thanks, guy! <wave>smooch</wave>
-> DONE

= pt_decline
~ decline_quest("pickup_tour")
Suit yourself. The gear will keep until you wise up.
-> END

= pt_in_progress
The gear's still out there. Go on, collect it.
-> END

= pt_return
You found every piece. Good. Here - you've earned an extra spring in your step.
+ [Thank him]
    ~ advance_quest("pickup_tour", "complete")
    ~ start_cutscene("pickup-tour-kiss")
    -> END

= pt_done
You've got the feel for it now. Use it well.
-> END
