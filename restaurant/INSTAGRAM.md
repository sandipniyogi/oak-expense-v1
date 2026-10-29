# Instagram feed — @theoaklounge786

The restaurant homepage includes an Instagram section, an Instagram profile link, and a cached grid of up to 12 posts. Reels link to Instagram and use their thumbnail when available; carousel cards open the full post on Instagram. No Instagram content is fabricated.

## Current connection status

The website is prepared, but the account is NOT connected until API credentials are configured. Before connection, visitors see a profile invitation. The admin Website settings panel shows connection status, the last successful sync and a refresh button.

## Check the account

Open @theoaklounge786 in the Instagram app. A Professional dashboard indicates a Business or Creator account. Otherwise check the account-type controls in Instagram Settings. The official Instagram Login API requires a professional account. Do not send an Instagram password or token through chat.

## Connect staging after checking the account type

Create/configure a Meta developer app with Instagram API with Instagram Login. Authorize the owned @theoaklounge786 account with the read-only instagram_business_basic permission and obtain its long-lived Instagram user access token. Do not use a Facebook Page token with this integration. Meta may require app roles or access review depending on the account/app setup.

From the parent oak-expense-v1 folder:

```sh
python3 restaurant/scripts/instagram.py --environment staging
python3 restaurant/scripts/local.py staging
```

Paste the API token only into the hidden local Terminal prompt. The setup script verifies the account username with Meta before saving the user ID and token in the existing staging environment file. Failed verification does not change it. Tokens stay server-side and are excluded from source patches and release packages. Mac live and VPS require their own environment configuration; credentials are not copied by code promotion.

The running website checks every 15 minutes and syncs on startup. It is polling, not instantaneous. Expired or revoked tokens require reconnection using the same script; token renewal is not automated in this patch. Admin reports connection failures without displaying credentials. No Instagram password is stored.

## Resilience and limitations

Posts are fetched server-side and cached in the existing restaurant SQLite volume. A failed request preserves the last successful feed. After 24 hours without success, the grid falls back to the profile link to avoid displaying expired image URLs. Images without a valid thumbnail show an Instagram link card. The browser loads thumbnails only from Instagram/Meta image hosts. Photos or Instagram links may be unavailable on networks that block Instagram, including some mainland China networks. Existing food, events and contact sections remain usable.

No private posts, Stories, comments, messages or publishing permissions are requested. No scraping, paid widget or account password is used. Real-account connection cannot be verified until the account owner authorizes the API.

## Staging-first workflow

Apply this source patch only after the lounge-menu edition. The patch validates original file hashes, backs up changed source under restaurant/backups/patches and refuses to overwrite differing source. It does not modify credentials, database volumes, uploads, expense code or deployment schedules. Rebuild staging and review the Instagram section. Promote through the existing Mac live then VPS release workflow after review.

References: Meta's official Instagram API collection: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api ; Instagram Login docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
