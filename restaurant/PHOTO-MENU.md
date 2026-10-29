# Short homepage and photo menu — staging patch

The homepage now contains a compact hero/story, three featured menu cards, upcoming events (two initially, with a More button), a compact Instagram section (up to three posts) and visit details. Repeated promotional sections and the full menu list have been removed from the homepage. Empty events are hidden.

The full menu is available at /menu. It retains Food, Drinks and Shisha tabs, menu-section filters, English/Chinese search, the original PDF links and progressive results. Clicking a card picture opens a larger image with its description, price and availability. Food has 92 portions/options; the complete catalog remains 185 entries.

169 catalog entries have images extracted directly from owner-supplied menu PDFs: all 92 food portions/options, 71 drinks and six shisha entries. Some menu variants use the same picture in the source PDF and retain that shared picture. Wine and the unspecified Special cocktail use a clearly labelled Photo coming soon placeholder. No product photographs were invented. The original menu artwork is retained where a source photo includes printed decoration. MENU-PHOTO-SOURCES.json records page and image references.

## Installation

Requires the lounge-menu edition plus the Instagram patch already installed. Extract this patch ZIP into Downloads, then run:

```sh
python3 "$HOME/Downloads/oak-photo-menu-patch/apply.py" --project "$HOME/Desktop/oak-expense-v1"
cd "$HOME/Desktop/oak-expense-v1"
python3 restaurant/scripts/local.py staging
```

Open http://localhost:3180 and http://localhost:3180/menu. Stop after staging; do not run live/package until the owner requests promotion. Existing running Mac-live and VPS containers are not restarted or changed by this patch.

The installer validates expected source hashes and every patch payload before changing files. It backs up changed source under restaurant/backups/patches, is safe to rerun, and refuses an unexpected source version. Credentials, existing Docker volumes, uploads and menu database rows remain in place. No database migration is required.

## Changing photographs

Use the existing admin menu editor to upload and save a JPG, PNG or WebP. A custom saved photo always takes precedence over the PDF-image lookup. Existing generic biryani/platter artwork is replaced at rendering time with its matching individual menu picture. Clearing a custom image returns to its supplied picture, or a placeholder if none exists. New dishes without matching supplied names also use the placeholder until a photo is uploaded. No prices, descriptions or publication settings are changed by this patch.

## Verification

26 Node tests plus six Python helper checks pass, including image coverage, custom-image priority, bilingual combined filtering, /menu routing, browser-module MIME, Instagram behavior, admin protection and existing content editing. Browser preview checked homepage featured cards, full-menu search, category switching and photo dialog. Mobile CSS uses a two-column menu and stacked homepage cards; physical device testing remains for Mac staging review. Docker Desktop build/health checks run when the owner executes staging.

## Mobile refinements
Sticky mobile header and Food/Drinks/Shisha tabs; swipeable section filters; 44px touch controls; 16px search/form inputs to avoid automatic iPhone focus zoom; two-column phone menu cards, one column for very narrow screens; phone-friendly photo dialogs and admin forms. Menu labels and descriptions wrap naturally. Navigation updates its accessibility label and closes on Escape, link selection or a click outside.

Homepage and menu were inspected at viewport widths 320, 360, 390, 430 and 768 with no body-level horizontal overflow. Phone-width browser checks covered navigation, Chinese search and the photo dialog. Admin login layout was inspected at 390px; authenticated admin layout and physical iOS/Android testing remain for owner staging review.

This combined patch accepts either the Instagram-patch baseline or the previous photo-menu patch. Apply it to the existing project and run staging only. No Mac-live or VPS deployment commands are included.
