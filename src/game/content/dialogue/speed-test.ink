== speed_test ==
# speaker: Quickfoot
# font: doublehomicide
Gather close, traveler. Let me tell you how I outran the Margrave's hounds.
+ [Go on, then.] -> st_tale
+ [Not now.] -> END

= st_tale
It began quietly. <speed=0.6>The fog rolled in, slow and thick,</speed> and then <speed=1.9>the hounds burst from the trees, howling, and I ran like the wind!</speed>
I did not stop. <speed=0.5>Not once.</speed>
+ [Then what?] -> st_end
+ [Incredible!] -> st_end

= st_end
<speed=1.7>I dove into the river, swam hard, and lost them by the old mill!</speed> <speed=0.7>And that, friend, is why they call me Quickfoot.</speed>
+ [Farewell.] -> END
