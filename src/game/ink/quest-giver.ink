== quest_giver ==
# speaker: Stranger
# font: doublehomicide
{quest_massacre == "active": -> qg_in_progress}
{quest_massacre == "return": -> qg_return}
{quest_massacre == "complete": -> qg_complete}
-> qg_offer

= qg_offer
{qg_offer == 1:
    Well met, wanderer. You've the look of someone the world already wrote off. Five of the Margrave's patrols walk this wood. I want them dead. All five. Do that and I'll see you paid.
    ~ start_quest("massacre", "offered")
- else:
    Still here? Five patrols. Dead. You in or not?
}
+ [Accept] -> qg_accepted
+ [Decline] -> qg_declined
* [Why me?] -> qg_why
+ [Leave] -> END

= qg_accepted
Good. Five of them. Don't disappoint me.
+ [Leave]
    ~ advance_quest("massacre", "active")
    -> END

= qg_declined
Suit yourself. The wood doesn't care either way.
+ [Leave]
    ~ decline_quest("massacre")
    -> END

= qg_why
I like to see the life drain out of the ones who think they own these roads. No one mourns a ghost's handiwork.
* [Damn, you're cool.] -> qg_offer
* [Um, alright...] -> qg_offer

= qg_in_progress
Have you slaughtered them yet? Five. I'll know if you lie.
-> END

= qg_return
Ha! The wood reeks of it. You've a talent for this. Here - you've earned it.
+ [Leave]
    ~ give_item("potion_healing", 1)
    ~ advance_quest("massacre", "complete")
    -> END

= qg_complete
Nothing more for you. Go on, ghost.
-> END
