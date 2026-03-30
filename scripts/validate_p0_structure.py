import json
from pathlib import Path

EXPECTED_PATHS = [
    "/",
    "/services",
    "/services/individual",
    "/about",
    "/about/boundaries",
    "/booking",
    "/booking/confirmed",
    "/privacy",
    "/consent",
    "/terms",
]

p = Path("p0/structure.json")
data = json.loads(p.read_text(encoding="utf-8"))
pages = data["pages"]
paths = [x["path"] for x in pages]

missing = [x for x in EXPECTED_PATHS if x not in paths]
extra = [x for x in paths if x not in EXPECTED_PATHS]
assert not missing, f"Missing P0 paths: {missing}"
assert not extra, f"Unexpected paths: {extra}"
assert len(pages) == 10, f"Expected 10 pages, got {len(pages)}"

for page in pages:
    assert page.get("primary_cta"), f"No CTA for {page['path']}"

legal = {"/privacy", "/consent", "/terms"}
for page in pages:
    links = set(page.get("footer_legal_links", []))
    assert legal.issubset(links), f"Footer legal links incomplete on {page['path']}"

nav = data.get("global_navigation", {})
expected_header = ["/", "/about", "/services", "/faq", "/contacts", "/booking"]
expected_footer = ["/contacts", "/privacy", "/consent", "/terms"]
assert nav.get("header") == expected_header, f"Unexpected header nav: {nav.get('header')}"
assert nav.get("mobile_menu") == expected_header, f"Unexpected mobile nav: {nav.get('mobile_menu')}"
assert nav.get("footer") == expected_footer, f"Unexpected footer nav: {nav.get('footer')}"
assert nav.get("sticky_cta") == "Записаться", "Sticky CTA must remain 'Записаться'"

# 2-step rule for content pages to booking
content_pages = ["/", "/services", "/services/individual", "/about", "/about/boundaries"]
by_path = {x["path"]: x for x in pages}
for path in content_pages:
    target = by_path[path].get("primary_cta_target")
    if target == "/booking":
        continue
    # allow services -> services/individual -> booking
    if path == "/services" and target == "/services/individual":
        assert by_path[target].get("primary_cta_target") == "/booking"
    else:
        raise AssertionError(f"Path to booking exceeds 2 steps for {path}")

print("P0 structure validation passed.")
