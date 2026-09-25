"""Turn uploads in photos/new/ into gallery images and add them to data/gallery.json.

Each photo may have a sidecar <same-name>.json with {"caption", "category"}.
Without one, a file name like "science--On shift at Super-K.jpg" sets both.
"""
import json, os, re, sys
from datetime import datetime, timezone
from PIL import Image, ImageOps
import pillow_heif

pillow_heif.register_heif_opener()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INBOX = os.path.join(ROOT, "photos", "new")
GAL = os.path.join(ROOT, "assets", "img", "gallery")
THUMB = os.path.join(ROOT, "assets", "img", "thumbs")
DATA = os.path.join(ROOT, "data", "gallery.json")
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".tif", ".tiff"}
CATS = {"science", "people", "travel"}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "photo"


def main():
    os.makedirs(GAL, exist_ok=True); os.makedirs(THUMB, exist_ok=True)
    gallery = json.load(open(DATA)) if os.path.exists(DATA) else []
    have = {p["id"] for p in gallery}
    added = []
    for name in sorted(os.listdir(INBOX)):
        stem, ext = os.path.splitext(name)
        if ext.lower() not in EXTS:
            continue
        src = os.path.join(INBOX, name)
        meta_path = os.path.join(INBOX, stem + ".json")
        meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
        cat, cap = meta.get("category"), meta.get("caption")
        if not cat and "--" in stem:
            head, tail = stem.split("--", 1)
            if head.lower() in CATS:
                cat, cap = head.lower(), cap or tail.strip()
        cat = cat if cat in CATS else "people"
        try:
            im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
        except Exception as e:
            print(f"skip {name}: {e}", file=sys.stderr)
            continue
        pid = slug(stem)
        while pid in have:
            pid += "-1"
        big = im.copy(); big.thumbnail((1600, 1600))
        big.save(os.path.join(GAL, pid + ".jpg"), quality=80, optimize=True, progressive=True)
        th = im.copy(); th.thumbnail((640, 640))
        th.save(os.path.join(THUMB, pid + ".webp"), quality=74)
        added.append({"id": pid, "category": cat, "caption": (cap or "").strip(),
                      "full": f"assets/img/gallery/{pid}.jpg", "thumb": f"assets/img/thumbs/{pid}.webp",
                      "w": th.size[0], "h": th.size[1],
                      "added": meta.get("added") or datetime.now(timezone.utc).isoformat(timespec="seconds")})
        have.add(pid)
        os.remove(src)
        if os.path.exists(meta_path):
            os.remove(meta_path)
        print(f"added {pid} ({cat})")
    # remove orphan sidecars whose photo is gone
    for name in os.listdir(INBOX):
        if name.endswith(".json") and not any(os.path.exists(os.path.join(INBOX, name[:-5] + e)) for e in
                                             [x for x in EXTS] + [x.upper() for x in EXTS]):
            os.remove(os.path.join(INBOX, name))
    if added:
        json.dump(added + gallery, open(DATA, "w"), indent=1, ensure_ascii=False)
        open(DATA, "a").write("\n")
    print(f"{len(added)} photo(s) added")


if __name__ == "__main__":
    main()
