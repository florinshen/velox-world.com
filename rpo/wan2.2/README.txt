Wan2.2-TI2V-5B (A, base model) against the same model after RPO fine-tuning (B): replacement clips

Open index.html in a browser. A is always on the left, B on the right.

What this is
  Both models render the same 61 prompts. An A clip and its B clip share the prompt and the starting noise.
  50 sampling steps, classifier-free guidance 5, 1280 x 704, 13 frames at 24 frames per second.
  The replacement source set does not include matching score data. The previous full-length gallery scores are
  intentionally not attached to these clips.

Files
  index.html, data.js                  the comparison page and media metadata
  side-by-side-v629s50/NNNN.mp4        61 files, one per prompt (NNNN = prompt number 0000-0060): A on the
                                       left, B on the right, 8 black pixels between them (2568 x 704, H.264)
  posters-v629s50/NNNN.jpg             full-resolution first frame of each paired file

Encoding
  H.264, yuv420p, 24 fps, CRF 16, slow preset, fast-start metadata, no audio.

On the page
  Clips play while they are in view. Click a clip for the large view. Keys there: Space flips between A and B
  in place, W goes back to the wipe, S shows both side by side, P plays or pauses, comma and period move one
  frame, left and right arrows change the prompt, and Esc closes.

The prompt texts are not published with this page; clips and images are identified by prompt number.
