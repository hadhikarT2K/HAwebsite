# Updating the website

## The easy way: the Manage site page
Open https://hadhikart2k.github.io/HAwebsite/admin.html (bookmark it).
The first time, paste a GitHub access key (the page shows how to create one).
After that, "Upload photos", "Add paper" and "Add talk" buttons appear on the site for you only.
Changes are live about 2 minutes later.

## What happens automatically
- **Papers**: every night the site copies your list from INSPIRE-HEP (author profile 1945984),
  and the Publications page also refreshes live from INSPIRE when opened.
- **Photos**: anything uploaded to `photos/new/` (from the Manage page, the GitHub app or github.com)
  is converted (iPhone HEIC included), resized, and added to the top of the gallery.
  A file named `science--On shift at Super-K.jpg` gets that category and caption.

## Where things live
- `data/gallery.json`: photos, captions, categories (newest first; first six appear on the home page)
- `data/papers.json`: papers you added by hand (merged with INSPIRE, never duplicated)
- `data/talks.json`: talks
- `.github/workflows/static.yml`: the job that processes photos, refreshes papers and publishes
