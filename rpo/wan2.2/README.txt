Wan2.2-TI2V-5B (A, base model) against the same model after RPO fine-tuning (B): generated clips

Open index.html in a browser. A is always on the left, B on the right.

What this is
  Both models render the same 61 prompts. An A clip and its B clip share the prompt and the starting noise.
  50 sampling steps, classifier-free guidance 5, 1280 x 704, 121 frames at 24 frames per second (5 seconds).
  Scores are HPSv3 (raw score, the mean over every 4th frame of a clip).

Files
  index.html, data.js     the compare page (data.js holds the scores)
  side-by-side/NNNN.mp4   61 files, one per prompt (NNNN = prompt number 0000-0060): the A clip on the left, the
                          B clip on the right, 8 black pixels between them (2568 x 704, H.264; plays in
                          QuickTime Player and in every browser)
  posters/NNNN.jpg        one frame of each file; the page shows it until the clip loads
  scores.tsv              one row per prompt: prompt number, HPSv3 of both clips, gain, file name

HPSv3, mean over the 61 prompts
  base 7.027   RPO 8.739   gain +1.712   RPO higher on 52 of 61 prompts

On the page: the clips play while they are in view (the Clips switch pauses them). Click a clip for the large
view. Keys there: Space flips between A and B in place, W goes back to the wipe, S shows both side by side,
P plays or pauses, the comma and period keys move one frame, the left and right arrows change the prompt,
Esc closes.

The prompt texts are not published with this page; clips and images are identified by prompt number.
