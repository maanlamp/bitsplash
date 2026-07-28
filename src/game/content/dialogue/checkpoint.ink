== checkpoint ==

= guard
# speaker: pennywhistle
# emotion: smug
This is a toll bridge, friend. It is also my bridge. Step onto the planks when you're ready to discuss the arrangement.
-> DONE

= demand
# speaker: pennywhistle
# emotion: angry
Halt! Nobody crosses Pennywhistle's Bridge without paying the Pennywhistle Toll. That's a bag of coin, or a very convincing reason. Which'll it be?
+ You slide a fat purse across the plank. # id: bribe
+ You refuse, and stand your ground. # id: refuse
- -> DONE

= bribe_accept
# speaker: pennywhistle
# emotion: happy
Ohoho! Now THAT is a convincing reason. Heavy, too. You're a scholar and a gentlebeast. Word travels, friend - the lads will remember you fondly.
-> DONE

= refuse
# speaker: pennywhistle
# emotion: angry
No coin? Bold. Foolish, but bold. Fine, cross - but the Pennywhistle ledger never forgets a stiff. We'll be watching the set of your shoulders.
-> DONE

= wave_through
# speaker: pennywhistle
# emotion: neutral
Go on, then. Mind the third plank, it bites. And tell the fog I said nothing.
-> DONE
