"""Save a copy of the INSPIRE-HEP publication list to data/publications.json.
The site shows this copy instantly, then refreshes from INSPIRE live."""
import json, os, urllib.parse, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "publications.json")
FIELDS = ("titles.title,collaborations.value,publication_info.journal_title,publication_info.journal_volume,"
          "publication_info.year,publication_info.artid,publication_info.page_start,arxiv_eprints.value,dois.value,"
          "citation_count,earliest_date,author_count,document_type,control_number")


def get(q):
    hits, url = [], ("https://inspirehep.net/api/literature?sort=mostrecent&size=250&q=" + urllib.parse.quote(q) + "&fields=" + FIELDS)
    while url:
        req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "HAwebsite-builder"})
        d = json.load(urllib.request.urlopen(req, timeout=60))
        hits += d["hits"]["hits"]
        url = d.get("links", {}).get("next")
    return hits


hits = get("authors.recid:1945984") or get("a Haradhan.Adhikary.1")
if hits:
    json.dump({"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "hits": {"total": len(hits), "hits": [{"metadata": h["metadata"]} for h in hits]}},
              open(OUT, "w"), separators=(",", ":"))
print(f"{len(hits)} records")
