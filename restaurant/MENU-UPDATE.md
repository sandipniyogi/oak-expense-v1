# Lounge menu update

Extract the ZIP inside /Users/sandip/Desktop/oak-expense-v1 without deleting the existing restaurant folder. This is source only: credentials, Docker volumes and uploads are excluded and remain in place.

Run: python3 restaurant/scripts/local.py staging

Open http://localhost:3180. The supplied catalog imports once with published prices. Matching existing admin names take precedence. Later admin edits and deletions are preserved. A custom hero is preserved; the original default hero changes to supplied menu artwork.

Searchable food: all 92 portions/options. Drinks: cocktails, mocktails, wine and beer. Shisha: six options. Full spirits and bottle service are in the linked original drinks PDF. Search supports English and Chinese. Show more expands results in groups of 12.

The source has unspecified ¥48/¥58 Caesar Salad options: both prices are retained in the note. Two Premium Cigar Leave names are distinguished by their Chinese names and prices. Please review in admin before production. Incorrect alcohol category headings in the PDF were corrected on the website.

Keep the existing flow: staging -> Mac live -> VPS. This ZIP does not deploy live automatically.
