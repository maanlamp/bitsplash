== checkpoint ==

= guard
# speaker: Sergeant Pennywhistle
# font: doublehomicide
This is a toll bridge, friend. It is also my bridge. Step onto the planks when you're ready to discuss the arrangement.
-> DONE

= demand
# speaker: Sergeant Pennywhistle
# font: doublehomicide
Halt! Nobody crosses Pennywhistle's Bridge without paying the Pennywhistle Toll. That's a bag of coin, or a very convincing reason. Which'll it be?
+ You slide a fat purse across the plank. # id: bribe
+ You refuse, and stand your ground. # id: refuse
- -> DONE

= bribe_accept
# speaker: Sergeant Pennywhistle
# font: doublehomicide
Ohoho! Now THAT is a convincing reason. Heavy, too. You're a scholar and a gentlebeast. Word travels, friend - the lads will remember you fondly.
-> DONE

= refuse
# speaker: Sergeant Pennywhistle
# font: doublehomicide
No coin? Bold. Foolish, but bold. Fine, cross - but the Pennywhistle ledger never forgets a stiff. We'll be watching the set of your shoulders.
-> DONE

= wave_through
# speaker: Sergeant Pennywhistle
# font: doublehomicide
Go on, then. Mind the third plank, it bites. And tell the fog I said nothing.
-> DONE
