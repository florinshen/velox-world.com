SD3.5-Medium (A, base model) against the same model after RPO fine-tuning (B): generated images

Open index.html in a browser. A is always on the left, B on the right.

What this is
  Both models render the same 64 prompts. An A image and its B image share the prompt and the starting noise.
  28 sampling steps, 512 x 512, no classifier-free guidance.
  Scores are HPSv3 (raw score, one forward pass per image).

Files
  index.html, data.js   the compare page (data.js holds the scores)
  base/NNNN.png         64 images of the base model (NNNN = prompt number 0000-0063)
  rpo/NNNN.png          the same prompts and starting noise after RPO fine-tuning
  scores.tsv            one row per prompt: prompt number, HPSv3 of both images, gain, file names

HPSv3, mean over the 64 prompts
  base 3.967   RPO 9.998   gain +6.031   RPO higher on 63 of 64 prompts

Keys in the large view: Space flips between A and B in place, W goes back to the wipe, the left and right arrows
change the prompt, Esc closes.

The prompt texts are not published with this page; clips and images are identified by prompt number.
