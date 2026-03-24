---
A full-screen react app, mobile first but we need to handle desktop too. Here are some notes: I want the following:
- A view of all my daily timer buckets, ready to count down. I tap one to start it, tap to stop. They fill the screen, and there's only a hamburger icon elsewhere or maybe a nav bar. For mobile I want the nav bar to look like a native icon bar across the bottom with the hamburger bottom right. Desktop it can be to the left with text over icon in a small (not wide) style. No need for collapse/expand functionality here because it's already made to look as small as it can get. It's just wide enough for the labels under the icons (narrow essentially pre-collapsed sidebar)
- A view of all my projects/initiatives
- Daily view of tasks
- Per project/initiative view of tasks.

So let's talk about the view of the daily timer buckets. That's what I want us to focus on most for this iteration, the other views can be placeholder.
The daily bucket timers. They take up the whole viewport, regardless of how many there are. They each have a different background color. They're sized according to how much time is allocated to them. As they countdown we see a more muted version of the background color emerge as progress completes. Text of the bucket description + time remaining. Tap to start, tap to stop. When done, the entire unit for a given time bucket goes away after a little success animation.

Holding down for a second or two (use standard best practice) on a bucket brings up a modal where I can choose to edit. Edit goes to bucket settings page where I can set its name, duration, and days where it shows up. Some buckets might not apply to some days, and I should be able to choose the days for each.
Also a "danger zone" delete option with confirmation.

The way we layout the buckets on the bucket countdowns page is key. It should by dynamic, and again, no space between items and they fill the whole space except for the small nav bar. Each one is sized based on its total time and disappears when done. So, what's a good algorithm for always filling the screen with sizes approximating (doesn't need to be exact) the duration of the item?

Let's discuss and please ask any questions as needed.
---
I imagine the progress being indicated left-to-right, so items could stack on top of each other, but small items might not take up the whole width.
The bucket heights and widths won't change based on the time left. They will show progress through the background color essentially being a progress indicator, left to right the background color becomes more muted. The size is determined by TOTAL time for the bucket, not elapsed. There does need to be a minimum width and height.
When buckets complete, there should be a short animation then the bucket pops out of existence and the others fill the space and if needed rearrange to fully fill the space.
One timer at a time. Clicking another automatically stops the current one.
Yes, timer state must persist. Start with localstorage.
Timers reset at 3am local.
Yes, seed with buckets: School Project (3hrs/day), Business Project (3hrs/day), Life Maintenance (1hr/day), Exercise (1hr/day), monday-friday with nothing on the weekends
We can start with auto-colors
---
Yes, the treemap is great.
Active timer: yes! we do need to indicate which one is running. Some kind of animation across the background color, pulse. Maybe a bit of a border adjustment too, not sure. Let's make it a beautiful UI/UX moment
No progress lost when paused, this adds up through the day (or, subtracts as the case may be). So there's not really paused vs stopped distinction. A bucket is either going or not. You can call it paused since we maintain state, but there's no losing state.