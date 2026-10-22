"""Covers for outreach magazines (data/outreach.json).

- An uploaded cover in photos/outreach-covers/<id>.<ext> is converted to assets/img/outreach/<id>.jpg.
- An issue with a PDF but no cover gets one rendered from the PDF's first page.
- The page count of each PDF is recorded.
"""
import json, os, glob
from PIL import Image, ImageOps
import pillow_heif

pillow_heif.register_heif_opener()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "outreach.json")
INBOX = os.path.join(ROOT, "photos", "outreach-covers")
OUT = os.path.join(ROOT, "assets", "img", "outreach")


def save_cover(im, iid):
    os.makedirs(OUT, exist_ok=True)
    im = ImageOps.exif_transpose(im).convert("RGB")
    im.thumbnail((900, 1200))
    rel = f"assets/img/outreach/{iid}.jpg"
    im.save(os.path.join(ROOT, rel), quality=82, optimize=True, progressive=True)
    return rel


def main():
    if not os.path.exists(DATA):
        return
    d = json.load(open(DATA))
    items = {it["id"]: it for it in d.get("items", [])}
    changed = False
    for path in glob.glob(os.path.join(INBOX, "*")):
        iid = os.path.splitext(os.path.basename(path))[0]
        if iid in items:
            try:
                items[iid]["cover"] = save_cover(Image.open(path), iid); changed = True
                print("cover from upload:", iid)
            except Exception as e:
                print("bad cover", path, e)
        os.remove(path)
    try:
        import pymupdf as fitz  # PyMuPDF
    except ImportError:
        fitz = None
    for it in items.values():
        pdf = it.get("file")
        if not pdf or not pdf.endswith(".pdf") or not os.path.exists(os.path.join(ROOT, pdf)) or fitz is None:
            continue
        if it.get("cover") and it.get("pages"):
            continue
        doc = fitz.open(os.path.join(ROOT, pdf))
        it["pages"] = doc.page_count; changed = True
        if not it.get("cover") and doc.page_count:
            pix = doc[0].get_pixmap(dpi=110)
            im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            it["cover"] = save_cover(im, it["id"])
            print("cover from PDF:", it["id"])
    if changed:
        json.dump(d, open(DATA, "w"), indent=1, ensure_ascii=False)
        open(DATA, "a").write("\n")


if __name__ == "__main__":
    main()
