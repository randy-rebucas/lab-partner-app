# Photo credits

Stock photos for sign-in, first-time setup, Today, the worklist sections and the public report
check. All from Unsplash under the Unsplash License (free for commercial use, no attribution
required; none are Unsplash+). Cropped, resized and desaturated 20% with sharp. Served through
`components/Photo.tsx` (next/image).

| File | Photographer | Source |
|---|---|---|
| sign-in.jpg, hematology.jpg | National Cancer Institute (Daniel Sone) | https://unsplash.com/photos/clear-glass-test-tubes-egT3xtDu9DQ |
| setup.jpg, other.jpg | Testalize.me | https://unsplash.com/photos/white-and-orange-plastic-tube-KWb_41kG0GE |
| today.jpg, clinical-microscopy.jpg | National Cancer Institute | https://unsplash.com/photos/scientist-using-microscope-in-laboratory-JxoWb7wHqnA |
| clinical-chemistry.jpg, verify.jpg | Julia Koblitz | https://unsplash.com/photos/scientist-using-pipette-with-test-tubes-in-lab-RlOAwXt2fEA |
| immunology-and-serology.jpg | Nathan Rimoux | https://unsplash.com/photos/scientist-is-using-a-pipette-in-a-laboratory-lgkareDEqKg |
| microbiology.jpg | ThisisEngineering | https://unsplash.com/photos/microscope-with-petri-dish-in-laboratory-bcqDxjddPGk |

Adding one: crop to the size used on its page (portraits 960×1280, bands 1200×600 or 1200×400,
section cards 720×360), desaturate 20%, JPEG quality ~72, keep it under 60 KB, then add it to
`PHOTOS` in components/Photo.tsx and a row here.
