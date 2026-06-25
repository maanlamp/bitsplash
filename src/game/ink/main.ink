INCLUDE quest-giver.ink
INCLUDE pickup-tutor.ink
INCLUDE signpost.ink
INCLUDE trap.ink

VAR quest_massacre = "none"
VAR quest_pickup_tour = "none"

EXTERNAL start_quest(quest, stage)
EXTERNAL advance_quest(quest, to)
EXTERNAL decline_quest(quest)
EXTERNAL give_item(item, count)
EXTERNAL begin_pickup_tour()
EXTERNAL next_pickup()
EXTERNAL end_pickup_tour()

-> END
